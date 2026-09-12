package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;

import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.kis.*;
import com.family.asset.mapper.*;
import java.math.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class SecuritiesService {
  private final CatalogService catalog;
  private final AccountMapper accounts;
  private final HoldingMapper holdings;
  private final SecurityTradeMapper trades;
  private final OperationMapper ops;
  private final LedgerService ledger;

  /**
   * 완전히 조회된 KIS 상태를 한 트랜잭션으로 반영한다.
   * 보유종목 교체, 예수금/평가액 갱신, 거래 저장 중 하나라도 실패하면 전체 롤백된다.
   * 총평가액 = 원화 예수금 + 달러 예수금 × 기준환율 + 보유종목 원화 평가액.
   */
  public void apply(Long id, BrokerState state) {
    ops.lock();
    var a = catalog.activeAccount(id);
    check(a.getAssetType() == AssetType.SECURITIES, "증권계좌가 아닙니다.");
    check(state.exchangeRate().signum() > 0, "환율은 0보다 커야 합니다.");
    ops.clearHoldings(id);
    BigDecimal value = state.depositKrw().add(state.depositUsd().multiply(state.exchangeRate()));
    for (var h : state.holdings()) {
      h.setId(null);
      h.setAccountId(id);
      holdings.insert(h);
      value = value.add(h.getValueKrw());
    }
    a.setDepositKrw(state.depositKrw());
    a.setDepositUsd(state.depositUsd());
    a.setExchangeRate(state.exchangeRate());
    a.setCurrentBalanceKrw(value.setScale(2, RoundingMode.HALF_UP));
    a.setLastSyncedAt(OffsetDateTime.now());
    accounts.update(a);
    importTrades(id, state.trades());
  }

  /**
   * 계좌별 externalId로 재조회 중복을 제거한다.
   * 배당은 수입 원장에 기록하지만 KIS 잔고에 이미 포함되므로 잔액을 다시 늘리지 않는다.
   */
  public void importTrades(Long id, List<SecurityTrade> data) {
    ops.lock();
    var a = catalog.activeAccount(id);
    check(a.getAssetType() == AssetType.SECURITIES, "증권계좌가 아닙니다.");
    Set<String> seen = new HashSet<>();
    trades.findAll().stream()
        .filter(t -> t.getAccountId().equals(id))
        .forEach(t -> seen.add(t.getExternalId()));
    for (var t : data) {
      check(
          t.getExternalId() != null
              && !t.getExternalId().isBlank()
              && t.getTradeDate() != null
              && t.getAmount() != null
              && t.getAmount().signum() >= 0
              && t.getExchangeRate() != null
              && t.getExchangeRate().signum() > 0,
          "증권 거래 식별자·일자·금액·환율을 확인해주세요.");
      check(
          Set.of("BUY", "SELL", "DEPOSIT", "WITHDRAWAL", "DIVIDEND").contains(t.getTradeType()),
          "증권 거래유형 오류");
      check(Set.of("USD", "KRW").contains(t.getCurrencyCode()), "KRW/USD만 지원합니다.");
      if (!seen.add(t.getExternalId())) continue;
      t.setId(null);
      t.setAccountId(id);
      t.setEntryId(null);
      if (t.getQuantity() == null) t.setQuantity(BigDecimal.ZERO);
      if (t.getTradeType().equals("DIVIDEND") && t.getAmount().signum() > 0) {
        var e = new Entry();
        e.setTransactionDate(t.getTradeDate());
        e.setTransactionType(TransactionType.INCOME);
        e.setAmount(t.getAmount().multiply(t.getExchangeRate()).setScale(2, RoundingMode.HALF_UP));
        e.setAttribution(Attribution.valueOf(a.getOwnerCode().name()));
        e.setCategoryId(catalog.systemCategory("DIVIDEND"));
        e.setTargetAccountId(id);
        e.setMemo(t.getSymbol() + " 배당금");
        t.setEntryId(ledger.create(e, "KIS", false).getId());
      }
      trades.insert(t);
    }
  }
}
