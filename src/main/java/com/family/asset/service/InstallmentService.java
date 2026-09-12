package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
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
public class InstallmentService {
  private final InstallmentMapper installments;
  private final InstallmentScheduleMapper schedules;
  private final OccurrenceMapper occurrences;
  private final OperationMapper ops;

  public List<InstallmentSchedule> list() { return schedules.findAll(); }

  public static List<InstallmentSchedule> calculate(Installment x, int paymentDay) {
    check(x.getRemainingMonths() > 0 && x.getRemainingAmount().signum() > 0,
        "잔여 개월과 금액은 0보다 커야 합니다.");
    var monthly = x.getRemainingAmount().divide(BigDecimal.valueOf(x.getRemainingMonths()), 2, RoundingMode.DOWN);
    check(monthly.signum() > 0, "월별 할부 금액은 0보다 커야 합니다.");
    List<InstallmentSchedule> rows = new ArrayList<>();
    for (int i = 0; i < x.getRemainingMonths(); i++) {
      var row = new InstallmentSchedule();
      row.setInstallmentId(x.getId());
      row.setDueDate(LoanService.day(YearMonth.from(x.getFirstPaymentDate()).plusMonths(i), paymentDay));
      row.setAmount(i == x.getRemainingMonths() - 1
          ? x.getRemainingAmount().subtract(monthly.multiply(BigDecimal.valueOf(i))) : monthly);
      row.setState("PENDING");
      rows.add(row);
    }
    return rows;
  }

  public void rebuild(Installment x, int paymentDay) {
    ops.lock();
    var rows = calculate(x, paymentDay);
    var existing = occurrences.findAll();
    for (var row : rows) {
      check(existing.stream().noneMatch(o -> Objects.equals(o.getCardId(), x.getCardId())
          && "CARD:".concat(x.getCardId().toString()).equals(o.getSourceKey())
          && YearMonth.from(o.getDueDate()).equals(YearMonth.from(row.getDueDate()))
          && !"PENDING".equals(o.getState())), "이미 완료 또는 취소된 카드 결제월에는 할부를 등록할 수 없습니다.");
    }
    schedules.cancelPending(x.getId());
    if (Boolean.TRUE.equals(x.getActive())) rows.forEach(schedules::insert);
    refreshPending(x.getCardId());
  }

  public void deactivate(Installment x) {
    ops.lock();
    schedules.cancelPending(x.getId());
    refreshPending(x.getCardId());
  }

  public List<InstallmentSchedule> pending(Long cardId, YearMonth month) {
    var ids = installments.findAll().stream()
        .filter(x -> Boolean.TRUE.equals(x.getActive()) && Objects.equals(x.getCardId(), cardId))
        .map(Installment::getId).toList();
    return schedules.findAll().stream().filter(s -> ids.contains(s.getInstallmentId())
        && "PENDING".equals(s.getState()) && YearMonth.from(s.getDueDate()).equals(month)).toList();
  }

  public BigDecimal total(Long cardId, YearMonth month) {
    return pending(cardId, month).stream().map(InstallmentSchedule::getAmount)
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  public void settle(Long cardId, Occurrence occurrence, Commands.Payment payment) {
    ops.lock();
    var rows = pending(cardId, YearMonth.from(occurrence.getDueDate()));
    var total = rows.stream().map(InstallmentSchedule::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    check(payment.amount().compareTo(total) >= 0,
        "실제 출금액은 이번 결제월의 할부 합계 이상이어야 합니다. 할부 내역과 결제월을 확인해주세요.");
    for (var row : rows) {
      var x = require(installments.findById(row.getInstallmentId()), "기존 할부");
      check(x.getRemainingMonths() > 0 && x.getRemainingAmount().compareTo(row.getAmount()) >= 0,
          "할부 잔액과 회차가 일치하지 않습니다.");
      row.setState("PAID");
      row.setOccurrenceId(occurrence.getId());
      row.setPaidDate(payment.date());
      check(schedules.update(row) == 1, "이미 처리된 할부 회차입니다.");
      x.setRemainingMonths(x.getRemainingMonths() - 1);
      x.setRemainingAmount(x.getRemainingAmount().subtract(row.getAmount()));
      if (x.getRemainingMonths() == 0) x.setActive(false);
      installments.update(x);
    }
  }

  private void refreshPending(Long cardId) {
    for (var o : occurrences.findAll()) {
      if (Objects.equals(o.getCardId(), cardId) && ("CARD:" + cardId).equals(o.getSourceKey())
          && "PENDING".equals(o.getState())) {
        var amount = total(cardId, YearMonth.from(o.getDueDate()));
        o.setAmount(amount.signum() > 0 ? amount : null);
        occurrences.update(o);
      }
    }
  }
}
