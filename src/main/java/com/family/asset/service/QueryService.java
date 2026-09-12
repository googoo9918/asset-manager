package com.family.asset.service;

import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(
    readOnly = true,
    isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
public class QueryService {
  private final CatalogService catalog;
  private final LedgerService ledger;
  private final HoldingMapper holdings;
  private final SecurityTradeMapper trades;

  public boolean owner(OwnerCode value, String filter) {
    return filter == null || filter.equals("JOINT") || value.name().equals(filter);
  }

  public List<Account> accounts(String owner) {
    return catalog.accounts().stream().filter(a -> owner(a.getOwnerCode(), owner)).toList();
  }

  public List<Loan> loans(String owner) {
    return catalog.loans().stream().filter(a -> owner(a.getOwnerCode(), owner)).toList();
  }

  public List<Entry> entries(
      String owner,
      LocalDate from,
      LocalDate to,
      String type,
      Long category,
      Long account,
      String q,
      boolean includeVoided) {
    Set<Long> cats = new HashSet<>();
    if (category != null) {
      cats.add(category);
      catalog.categories().stream()
          .filter(c -> category.equals(c.getParentId()))
          .forEach(c -> cats.add(c.getId()));
    }
    return ledger.list().stream()
        .filter(e -> includeVoided || !e.getVoided())
        .filter(
            e ->
                owner == null
                    || owner.equals("JOINT")
                    || (e.getTransactionType() == TransactionType.TRANSFER
                        ? accounts(owner).stream()
                            .anyMatch(
                                a ->
                                    a.getId().equals(e.getSourceAccountId())
                                        || a.getId().equals(e.getTargetAccountId()))
                        : e.getAttribution().name().equals(owner)))
        .filter(e -> from == null || !e.getTransactionDate().isBefore(from))
        .filter(e -> to == null || !e.getTransactionDate().isAfter(to))
        .filter(e -> type == null || type.isBlank() || e.getTransactionType().name().equals(type))
        .filter(e -> category == null || cats.contains(e.getCategoryId()))
        .filter(
            e ->
                account == null
                    || account.equals(e.getSourceAccountId())
                    || account.equals(e.getTargetAccountId()))
        .filter(
            e ->
                q == null
                    || q.isBlank()
                    || (e.getMemo() != null && e.getMemo().toLowerCase().contains(q.toLowerCase())))
        .sorted(
            Comparator.comparing(Entry::getTransactionDate).thenComparing(Entry::getId).reversed())
        .toList();
  }

  public Map<String, Object> summary(String owner) {
    var aa = accounts(owner);
    var ll = loans(owner);
    BigDecimal assets =
        aa.stream().map(Account::getCurrentBalanceKrw).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal debts =
        ll.stream().map(Loan::getCurrentBalance).reduce(BigDecimal.ZERO, BigDecimal::add);
    Map<String, BigDecimal> groups = new LinkedHashMap<>();
    for (var t : AssetType.values())
      groups.put(
          t.name(),
          aa.stream()
              .filter(a -> a.getAssetType() == t)
              .map(Account::getCurrentBalanceKrw)
              .reduce(BigDecimal.ZERO, BigDecimal::add));
    return Map.of(
        "assets", assets, "debts", debts, "net", assets.subtract(debts), "groups", groups);
  }

  public Map<String, Object> monthly(String owner, YearMonth month) {
    var es = entries(owner, month.atDay(1), month.atEndOfMonth(), null, null, null, null, false);
    var income = BigDecimal.ZERO;
    var expense = BigDecimal.ZERO;
    Map<String, BigDecimal> major = new LinkedHashMap<>(), minor = new LinkedHashMap<>();
    Map<Long, Category> cm = new HashMap<>();
    catalog.categories().forEach(c -> cm.put(c.getId(), c));
    for (var e : es) {
      if (e.getTransactionType() == TransactionType.INCOME) income = income.add(e.getAmount());
      if (e.getTransactionType() == TransactionType.EXPENSE) {
        expense = expense.add(e.getAmount());
        var c = cm.get(e.getCategoryId());
        var p = c.getParentId() == null ? c : cm.get(c.getParentId());
        major.merge(p.getName(), e.getAmount(), BigDecimal::add);
        minor.merge(p.getName() + " > " + c.getName(), e.getAmount(), BigDecimal::add);
      }
    }
    return Map.of("income", income, "expense", expense, "major", major, "minor", minor);
  }

  public List<Holding> holdings(Long account, String owner) {
    Set<Long> ids = new HashSet<>();
    accounts(owner).forEach(a -> ids.add(a.getId()));
    return holdings.findAll().stream()
        .filter(
            h ->
                ids.contains(h.getAccountId())
                    && (account == null || account.equals(h.getAccountId())))
        .toList();
  }

  public List<SecurityTrade> trades(Long account) {
    return trades.findAll().stream()
        .filter(t -> account == null || account.equals(t.getAccountId()))
        .sorted(Comparator.comparing(SecurityTrade::getTradeDate).reversed())
        .toList();
  }

  /**
   * 동일 종목코드와 통화를 묶어 수량, 평가금액, 매입원가를 합산한다.
   * UI 가중평균 매입가는 costNative / quantity로 계산하며, 계좌별 평단가의
   * 단순 평균을 쓰지 않는다. 예수금은 별도 행이며 주식 수익률 계산에서 제외한다.
   */
  public List<Map<String, Object>> portfolio(String owner) {
    Map<String, Map<String, Object>> result = new LinkedHashMap<>();
    for (var h : holdings(null, owner)) {
      String key = h.getSymbol() + ":" + h.getCurrencyCode();
      var row =
          result.computeIfAbsent(
              key,
              k ->
                  new HashMap<>(
                      Map.of(
                          "symbol",
                          h.getSymbol(),
                          "name",
                          h.getName(),
                          "currency",
                          h.getCurrencyCode(),
                          "quantity",
                          BigDecimal.ZERO,
                          "valueKrw",
                          BigDecimal.ZERO,
                          "valueNative",
                          BigDecimal.ZERO,
                          "costNative",
                          BigDecimal.ZERO)));
      row.put("quantity", ((BigDecimal) row.get("quantity")).add(h.getQuantity()));
      row.put("valueKrw", ((BigDecimal) row.get("valueKrw")).add(h.getValueKrw()));
      row.put("valueNative", ((BigDecimal) row.get("valueNative")).add(h.getValueNative()));
      row.put(
          "costNative",
          ((BigDecimal) row.get("costNative")).add(h.getAveragePrice().multiply(h.getQuantity())));
    }
    var cash =
        accounts(owner).stream()
            .filter(a -> a.getAssetType() == AssetType.SECURITIES)
            .map(a -> a.getDepositKrw().add(a.getDepositUsd().multiply(a.getExchangeRate())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    var rows = new ArrayList<>(result.values());
    rows.add(
        new HashMap<>(
            Map.of(
                "symbol",
                "CASH",
                "name",
                "예수금",
                "currency",
                "KRW",
                "quantity",
                BigDecimal.ZERO,
                "valueKrw",
                cash,
                "valueNative",
                cash,
                "costNative",
                cash)));
    return rows;
  }
}
