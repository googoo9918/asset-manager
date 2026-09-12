package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;

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
@Transactional
public class LoanService {
  private final CatalogService catalog;
  private final LoanMapper loans;
  private final OperationMapper ops;
  private final LedgerService ledger;

  public static BigDecimal money(BigDecimal n) {
    return n.setScale(2, RoundingMode.HALF_UP);
  }

  public static LocalDate day(YearMonth m, int day) {
    return m.atDay(Math.min(day, m.lengthOfMonth()));
  }

  public static List<Commands.ScheduleRow> calculate(
      Loan l, LocalDate from, List<Map<String, Object>> changes) {
    List<LocalDate> dates = new ArrayList<>();
    var month = YearMonth.from(from);
    for (int i = 0; i < 1200; i++) {
      var d = day(month.plusMonths(i), l.getPaymentDay());
      if (d.isBefore(from)) continue;
      if (!d.isBefore(l.getMaturityDate())) {
        dates.add(l.getMaturityDate());
        break;
      }
      dates.add(d);
    }
    if (l.getMaturityDate().isBefore(from) || l.getCurrentBalance().signum() == 0) return List.of();
    check(
        !dates.isEmpty() && !dates.get(dates.size() - 1).isBefore(l.getMaturityDate()),
        "대출 예상기간은 100년 이내여야 합니다.");
    BigDecimal balance = l.getCurrentBalance(), rate = l.getInterestRate();
    List<Commands.ScheduleRow> result = new ArrayList<>();
    for (int i = 0; i < dates.size(); i++) {
      var d = dates.get(i);
      for (var h : changes) {
        LocalDate effective = LocalDate.parse(h.get("effective_date").toString());
        if (!effective.isAfter(d)) rate = (BigDecimal) h.get("new_rate");
      }
      var r = rate.divide(new BigDecimal("1200"), 16, RoundingMode.HALF_UP);
      var interest = money(balance.multiply(r));
      int remaining = dates.size() - i;
      BigDecimal principal;
      if (l.getRepaymentType() == RepaymentType.BULLET)
        principal = remaining == 1 ? balance : BigDecimal.ZERO;
      else if (l.getRepaymentType() == RepaymentType.EQUAL_PRINCIPAL || r.signum() == 0)
        principal = money(balance.divide(BigDecimal.valueOf(remaining), 12, RoundingMode.HALF_UP));
      else {
        var factor = BigDecimal.ONE.add(r).pow(remaining, MathContext.DECIMAL128);
        var payment =
            balance
                .multiply(r)
                .multiply(factor)
                .divide(factor.subtract(BigDecimal.ONE), 12, RoundingMode.HALF_UP);
        principal = money(payment.subtract(interest));
      }
      if (remaining == 1 || principal.compareTo(balance) > 0) principal = balance;
      principal = principal.max(BigDecimal.ZERO);
      balance = money(balance.subtract(principal));
      result.add(
          new Commands.ScheduleRow(
              d, principal, interest, money(principal.add(interest)), balance));
    }
    return result;
  }

  public List<Commands.ScheduleRow> schedule(Long id, LocalDate from) {
    var l = catalog.loan(id);
    var paid =
        ops.repayments(id).stream()
            .filter(x -> !Boolean.TRUE.equals(x.get("early")))
            .map(x -> LocalDate.parse(x.get("payment_date").toString()))
            .max(LocalDate::compareTo);
    if (paid.isPresent() && !from.isAfter(paid.get())) from = paid.get().plusDays(1);
    return calculate(l, from, ops.rates(id));
  }

  public void rate(Long id, Commands.Rate r) {
    ops.lock();
    var l = catalog.loan(id);
    check(
        !r.effectiveDate().isBefore(LocalDate.now(ZoneId.of("Asia/Seoul"))),
        "과거 금리 변경은 지원하지 않습니다. 오늘 또는 미래 적용일을 입력해주세요.");
    var history = ops.rates(id);
    check(
        history.stream()
            .noneMatch(
                x -> LocalDate.parse(x.get("effective_date").toString()).equals(r.effectiveDate())),
        "같은 적용일의 금리 이력이 존재합니다.");
    // Append-only effective-date order keeps the before/after rate history unambiguous.
    if (!history.isEmpty()) {
      check(
          r.effectiveDate()
              .isAfter(LocalDate.parse(history.getLast().get("effective_date").toString())),
          "금리 변경은 마지막 등록 적용일 이후 순서로 입력해주세요.");
    }
    BigDecimal previousRate =
        history.isEmpty() ? l.getInterestRate() : (BigDecimal) history.getLast().get("new_rate");
    ops.rate(
        Map.of(
            "loanId", id, "date", r.effectiveDate(), "oldRate", previousRate, "newRate", r.rate()));
    if (!r.effectiveDate().isAfter(LocalDate.now(ZoneId.of("Asia/Seoul")))) {
      l.setInterestRate(r.rate());
      loans.update(l);
    }
  }

  public void applyRates() {
    ops.lock();
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
    for (var l : catalog.loans()) {
      var histories = ops.rates(l.getId());
      for (var r : histories)
        if (!LocalDate.parse(r.get("effective_date").toString()).isAfter(today))
          l.setInterestRate((BigDecimal) r.get("new_rate"));
      loans.update(l);
    }
  }

  public void repay(Long id, Commands.Repayment r, Long occurrenceId) {
    ops.lock();
    var l = catalog.loan(id);
    check(l.getStatus() == AssetStatus.ACTIVE, "종료된 대출입니다.");
    catalog.activeAccount(r.accountId());
    check(
        r.principal().signum() >= 0 && r.interest().signum() >= 0 && r.fee().signum() >= 0,
        "상환금액은 음수일 수 없습니다.");
    check(r.principal().compareTo(l.getCurrentBalance()) <= 0, "상환원금이 대출잔액을 초과합니다.");
    var total = money(r.principal().add(r.interest()).add(r.fee()));
    check(total.signum() > 0, "총 상환금액은 0보다 커야 합니다.");
    ops.changeBalance(r.accountId(), total.negate());
    l.setCurrentBalance(money(l.getCurrentBalance().subtract(r.principal())));
    loans.update(l);
    var owner = Attribution.valueOf(l.getOwnerCode().name());
    var e =
        ledger.linkedExpense(
            r.date(),
            r.interest(),
            owner,
            catalog.systemCategory("LOAN_INTEREST"),
            r.accountId(),
            l.getLoanName() + " 이자",
            "LOAN");
    ledger.linkedExpense(
        r.date(),
        r.fee(),
        owner,
        catalog.systemCategory("LOAN_FEE"),
        r.accountId(),
        l.getLoanName() + " 중도상환수수료",
        "LOAN");
    Map<String, Object> row = new HashMap<>();
    row.put("loanId", id);
    row.put("accountId", r.accountId());
    row.put("date", r.date());
    row.put("principal", money(r.principal()));
    row.put("interest", money(r.interest()));
    row.put("fee", money(r.fee()));
    row.put("early", r.early());
    row.put("entryId", e == null ? null : e.getId());
    row.put("occurrenceId", occurrenceId);
    ops.repayment(row);
  }
}
