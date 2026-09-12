package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;

import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class LedgerService {
  private final EntryMapper entries;
  private final OperationMapper ops;
  private final CatalogService catalog;

  public List<Entry> list() {
    return entries.findAll();
  }

  public Entry get(Long id) {
    return require(entries.findById(id), "거래");
  }

  public List<Entry> batch(Commands.Batch r) {
    ops.lock();
    return r.entries().stream()
        .map(
            e -> {
              e.setReplacesId(null);
              return create(e, "MANUAL", true);
            })
        .toList();
  }

  public Entry create(Entry e, String origin, boolean affectBalance) {
    ops.lock();
    e.setId(null);
    e.setVoided(false);
    e.setOrigin(origin);
    if (e.getInstallmentMonths() == null) e.setInstallmentMonths(1);
    check(e.getAmount() != null && e.getAmount().signum() > 0, "금액은 0보다 커야 합니다.");
    if (e.getTransactionType() != TransactionType.TRANSFER)
      catalog.categoryFor(e.getCategoryId(), e.getTransactionType());
    else e.setCategoryId(null);
    Long from = null, to = null;
    switch (e.getTransactionType()) {
      case INCOME -> {
        to = catalog.activeAccount(e.getTargetAccountId()).getId();
        e.setSourceAccountId(null);
        e.setCardId(null);
        e.setPaymentMethod(null);
        e.setInstallmentMonths(1);
      }
      case TRANSFER -> {
        from = catalog.activeAccount(e.getSourceAccountId()).getId();
        to = catalog.activeAccount(e.getTargetAccountId()).getId();
        check(!from.equals(to), "출발/도착 계좌가 같을 수 없습니다.");
        e.setCardId(null);
        e.setPaymentMethod(null);
        e.setInstallmentMonths(1);
      }
      case EXPENSE -> {
        e.setTargetAccountId(null);
        check(e.getPaymentMethod() != null, "결제수단을 선택해주세요.");
        if (e.getPaymentMethod() == PaymentMethod.ACCOUNT) {
          from = catalog.activeAccount(e.getSourceAccountId()).getId();
          e.setCardId(null);
          e.setInstallmentMonths(1);
        } else {
          var c = catalog.card(e.getCardId());
          check(c.getStatus() == AssetStatus.ACTIVE, "해지된 카드입니다.");
          check(c.getCardType().name().equals(e.getPaymentMethod().name()), "카드 유형과 결제수단이 다릅니다.");
          e.setSourceAccountId(c.getAccountId());
          if (c.getCardType() == CardType.DEBIT) {
            from = catalog.activeAccount(c.getAccountId()).getId();
            e.setInstallmentMonths(1);
          }
        }
      }
    }
    entries.insert(e);
    if (affectBalance) {
      if (from != null) effect(e.getId(), from, e.getAmount().negate());
      if (to != null) effect(e.getId(), to, e.getAmount());
    }
    return get(e.getId());
  }

  private void effect(Long entry, Long account, BigDecimal delta) {
    ops.changeBalance(account, delta);
    ops.effect(entry, account, delta);
  }

  public void cancel(Long id) {
    ops.lock();
    var e = get(id);
    check(!e.getVoided(), "이미 취소된 거래입니다.");
    check("MANUAL".equals(e.getOrigin()), "자동 연결 거래는 원본 처리 이력에서 관리합니다.");
    for (var x : ops.effects(id))
      ops.changeBalance(
          ((Number) x.get("account_id")).longValue(), ((BigDecimal) x.get("delta")).negate());
    e.setVoided(true);
    entries.update(e);
  }

  public Entry replace(Long id, Entry next) {
    ops.lock();
    cancel(id);
    next.setReplacesId(id);
    return create(next, "MANUAL", true);
  }

  public Entry linkedExpense(
      java.time.LocalDate date,
      BigDecimal amount,
      Attribution owner,
      Long category,
      Long account,
      String memo,
      String origin) {
    if (amount.signum() == 0) return null;
    var e = new Entry();
    e.setTransactionDate(date);
    e.setTransactionType(TransactionType.EXPENSE);
    e.setAmount(amount);
    e.setAttribution(owner);
    e.setCategoryId(category);
    e.setPaymentMethod(PaymentMethod.ACCOUNT);
    e.setSourceAccountId(account);
    e.setMemo(memo);
    return create(e, origin, false);
  }
}
