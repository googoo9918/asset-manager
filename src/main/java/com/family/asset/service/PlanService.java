package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;

import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class PlanService {
  private final CatalogService catalog;
  private final LoanService loanService;
  private final LedgerService ledger;
  private final OccurrenceMapper occurrences;
  private final OperationMapper ops;
  private final InstallmentService installmentService;

  public Occurrence get(Long id) { return require(occurrences.findById(id), "예정 거래"); }

  public List<Occurrence> cardAccountGroup(Long id) {
    var first = get(id);
    if (first.getSourceKey().startsWith("CARD_ACCOUNT:"))
      return occurrences.findAll().stream().filter(o -> Objects.equals(o.getPaymentGroupId(), id)).toList();
    check(first.getPlanType() == PlanType.CARD_PAYMENT && first.getCardId() != null
        && "PENDING".equals(first.getState()), "미처리 카드 결제 예정만 묶을 수 있습니다.");
    return occurrences.findAll().stream().filter(o -> o.getPlanType() == PlanType.CARD_PAYMENT
        && o.getCardId() != null && "PENDING".equals(o.getState())
        && Objects.equals(o.getAccountId(), first.getAccountId())
        && effectiveDate(o).equals(effectiveDate(first))
        && YearMonth.from(o.getDueDate()).equals(YearMonth.from(first.getDueDate()))).toList();
  }

  private LocalDate effectiveDate(Occurrence o) {
    return o.getActualDate() == null ? o.getDueDate() : o.getActualDate();
  }

  private List<Occurrence> checkedCardGroup(Long accountId, List<Long> ids) {
    check(ids != null && !ids.isEmpty() && new HashSet<>(ids).size() == ids.size(), "결제 예정 목록을 확인해주세요.");
    var rows = cardAccountGroup(ids.getFirst());
    check(!rows.isEmpty() && rows.stream().allMatch(o -> "PENDING".equals(o.getState())), "이미 처리된 카드 결제입니다.");
    check(new HashSet<>(rows.stream().map(Occurrence::getId).toList()).equals(new HashSet<>(ids)),
        "결제 예정 목록이 변경되었습니다. 다시 조회해주세요.");
    catalog.activeAccount(accountId);
    for (var o : rows) {
      var c = catalog.card(o.getCardId());
      check(Objects.equals(o.getAccountId(), accountId) && Objects.equals(c.getAccountId(), accountId)
          && c.getCardType() == CardType.CREDIT && c.getStatus() == AssetStatus.ACTIVE,
          "카드 결제계좌가 변경되었거나 비활성 상태입니다. 다시 조회해주세요.");
    }
    return rows;
  }

  public Occurrence confirmCardAccount(Commands.AccountCardPayment r) {
    ops.lock();
    var rows = checkedCardGroup(r.accountId(), r.occurrenceIds());
    var total = rows.stream().map(o -> installmentService.total(o.getCardId(), YearMonth.from(o.getDueDate())))
        .reduce(BigDecimal.ZERO, BigDecimal::add);
    check(r.amount().signum() > 0 && InstallmentService.coversTotal(r.amount(), total),
        "실제 총 출금액은 포함된 카드의 할부 합계 이상이어야 합니다. 원 단위 합계: "
            + total.setScale(0, java.math.RoundingMode.HALF_UP).toPlainString() + "원");
    var account = catalog.account(r.accountId());
    var group = base("CARD_ACCOUNT:" + UUID.randomUUID(), rows.getFirst().getDueDate(),
        account.getAccountName() + " 카드대금", PlanType.CARD_PAYMENT, Attribution.valueOf(account.getOwnerCode().name()));
    group.setAccountId(r.accountId());
    group.setAmount(total.signum() > 0 ? total : null);
    group.setState("COMPLETED");
    group.setActualDate(r.date());
    group.setActualAmount(r.amount());
    occurrences.insert(group);
    for (var o : rows) {
      var minimum = installmentService.total(o.getCardId(), YearMonth.from(o.getDueDate()));
      installmentService.settle(o.getCardId(), o, new Commands.Payment(r.date(), minimum));
      o.setState("COMPLETED");
      o.setActualDate(r.date());
      o.setActualAmount(null);
      o.setPaymentGroupId(group.getId());
      occurrences.update(o);
    }
    ops.changeBalance(r.accountId(), r.amount().negate());
    return group;
  }

  public void moveCardAccount(Commands.OccurrenceGroup r) {
    ops.lock();
    for (var o : checkedCardGroup(r.accountId(), r.occurrenceIds())) move(o.getId(), r.date());
  }

  public void cancelCardAccount(Commands.OccurrenceGroup r) {
    ops.lock();
    var rows = checkedCardGroup(r.accountId(), r.occurrenceIds());
    for (var o : rows) check(installmentService.total(o.getCardId(), YearMonth.from(o.getDueDate())).signum() == 0,
        "할부가 연결된 결제입니다. 날짜를 변경하거나 할부를 비활성화해주세요.");
    for (var o : rows) cancel(o.getId());
  }

  public List<Occurrence> month(YearMonth month) {
    generate(month);
    return occurrences.findAll().stream()
        .filter(
            o ->
                YearMonth.from(o.getActualDate() == null ? o.getDueDate() : o.getActualDate())
                    .equals(month))
        .toList();
  }

  public void generate(YearMonth month) {
    ops.lock();
    var existing = occurrences.findAll();
    Set<String> desired = new HashSet<>();
    for (var c : catalog.cards())
      if (c.getStatus() == AssetStatus.ACTIVE && c.getCardType() == CardType.CREDIT) {
        var date = LoanService.day(month, c.getPaymentDay());
        if (!date.isBefore(
            c.getCreatedAt().atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDate())) {
          var o =
              base(
                  "CARD:" + c.getId(),
                  date,
                  c.getCardName() + " 결제대금 입력 필요",
                  PlanType.CARD_PAYMENT,
                  Attribution.valueOf(c.getOwnerCode().name()));
          o.setCardId(c.getId());
          o.setAccountId(c.getAccountId());
          var installmentAmount = installmentService.total(c.getId(), month);
          o.setAmount(installmentAmount.signum() > 0 ? installmentAmount : null);
          upsert(o, existing, desired);
        }
      }
    for (var a : catalog.accounts())
      if (a.getStatus() == AssetStatus.ACTIVE && a.getAssetType() == AssetType.SAVINGS) {
        var date = LoanService.day(month, a.getPaymentDay());
        if (!date.isBefore(a.getStartDate()) && !date.isAfter(a.getMaturityDate())) {
          var o =
              base(
                  "SAVINGS:" + a.getId(),
                  date,
                  a.getAccountName() + " 납입",
                  PlanType.SAVINGS,
                  Attribution.valueOf(a.getOwnerCode().name()));
          o.setAccountId(a.getWithdrawalAccountId());
          o.setTargetAccountId(a.getId());
          o.setAmount(a.getMonthlyAmount());
          upsert(o, existing, desired);
        }
      }
    for (var l : catalog.loans())
      if (l.getStatus() == AssetStatus.ACTIVE && l.getCurrentBalance().signum() > 0) {
        var date = LoanService.day(month, l.getPaymentDay());
        if (YearMonth.from(l.getMaturityDate()).equals(month) && date.isAfter(l.getMaturityDate()))
          date = l.getMaturityDate();
        if (!date.isAfter(l.getMaturityDate())
            && !date.isBefore(
                l.getCreatedAt().atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDate())) {
          var o =
              base(
                  "LOAN:" + l.getId(),
                  date,
                  l.getLoanName() + " 상환",
                  PlanType.LOAN,
                  Attribution.valueOf(l.getOwnerCode().name()));
          o.setLoanId(l.getId());
          o.setAccountId(l.getAccountId());
          var today = LocalDate.now(ZoneId.of("Asia/Seoul"));
          var schedule = loanService.schedule(l.getId(), date.isBefore(today) ? date : today);
          LocalDate due = date;
          o.setAmount(
              schedule.stream()
                  .filter(r -> r.date().equals(due))
                  .map(Commands.ScheduleRow::total)
                  .findFirst()
                  .orElse(null));
          upsert(o, existing, desired);
        }
      }
    for (var p : catalog.plans())
      if (p.getActive())
        for (int i = 1; i <= month.lengthOfMonth(); i++) {
          var d = month.atDay(i);
          if (matches(p, d)) {
            var o = base("PLAN:" + p.getId(), d, p.getTitle(), p.getPlanType(), p.getAttribution());
            o.setPlanId(p.getId());
            o.setAccountId(p.getAccountId());
            o.setAmount(p.getAmount());
            o.setCategoryId(p.getCategoryId());
            upsert(o, existing, desired);
          }
        }
    for (var old : existing)
      if ("PENDING".equals(old.getState())
          && YearMonth.from(old.getDueDate()).equals(month)
          && !desired.contains(old.getSourceKey() + ":" + old.getDueDate())) {
        old.setState("CANCELLED");
        occurrences.update(old);
      }
  }

  private boolean matches(Plan p, LocalDate d) {
    if (d.isBefore(p.getStartDate()) || (p.getEndDate() != null && d.isAfter(p.getEndDate())))
      return false;
    var start = p.getStartDate();
    return switch (p.getRepeatCycle()) {
      case ONCE -> d.equals(start);
      case WEEKLY -> d.getDayOfWeek() == start.getDayOfWeek();
      case MONTHLY -> d.equals(LoanService.day(YearMonth.from(d), start.getDayOfMonth()));
      case YEARLY ->
          d.getMonth() == start.getMonth()
              && d.equals(LoanService.day(YearMonth.from(d), start.getDayOfMonth()));
    };
  }

  private Occurrence base(
      String key, LocalDate date, String title, PlanType type, Attribution attr) {
    var o = new Occurrence();
    o.setSourceKey(key);
    o.setDueDate(date);
    o.setTitle(title);
    o.setPlanType(type);
    o.setAttribution(attr);
    o.setState("PENDING");
    return o;
  }

  private void upsert(Occurrence o, List<Occurrence> existing, Set<String> desired) {
    desired.add(o.getSourceKey() + ":" + o.getDueDate());
    var old =
        existing.stream()
            .filter(
                x ->
                    x.getSourceKey().equals(o.getSourceKey())
                        && (x.getDueDate().equals(o.getDueDate())
                            || (o.getSourceKey().startsWith("CARD:")
                                && YearMonth.from(x.getDueDate()).equals(YearMonth.from(o.getDueDate())))))
            .findFirst();
    if (old.isEmpty()) occurrences.insert(o);
    else if ("PENDING".equals(old.get().getState())) {
      desired.add(old.get().getSourceKey() + ":" + old.get().getDueDate());
      o.setId(old.get().getId());
      o.setActualDate(old.get().getActualDate());
      occurrences.update(o);
    }
  }

  public void cancel(Long id) {
    ops.lock();
    var o = require(occurrences.findById(id), "예정 항목");
    check("PENDING".equals(o.getState()), "미처리 예정만 취소할 수 있습니다.");
    if (o.getPlanType() == PlanType.CARD_PAYMENT)
      check(installmentService.total(o.getCardId(), YearMonth.from(o.getDueDate())).signum() == 0,
          "할부가 연결된 카드 결제입니다. 날짜를 변경하거나 해당 할부를 비활성화한 후 취소해주세요.");
    o.setState("CANCELLED");
    occurrences.update(o);
  }

  public void move(Long id, LocalDate date) {
    ops.lock();
    var o = require(occurrences.findById(id), "예정 거래");
    check("PENDING".equals(o.getState()), "미처리 예정만 변경할 수 있습니다.");
    o.setActualDate(date);
    occurrences.update(o);
  }

  public Occurrence confirm(Long id, Commands.Confirm r) {
    ops.lock();
    var o = require(occurrences.findById(id), "예정 거래");
    check("PENDING".equals(o.getState()), "이미 처리된 예정 거래입니다.");
    Long entryId = null;
    switch (o.getPlanType()) {
      case CARD_PAYMENT -> payCard(o.getCardId(), new Commands.Payment(r.date(), r.amount()), id);
      case LOAN -> {
        check(r.principal() != null && r.interest() != null, "실제 상환 원금과 이자를 입력해주세요.");
        check(
            r.principal().add(r.interest()).compareTo(r.amount()) == 0, "원금과 이자 합계가 실제 출금액과 다릅니다.");
        loanService.repay(
            o.getLoanId(),
            new Commands.Repayment(
                r.date(), r.principal(), r.interest(), BigDecimal.ZERO, o.getAccountId(), false),
            id);
      }
      case SAVINGS, EXPENSE -> {
        var e = new Entry();
        e.setTransactionDate(r.date());
        e.setAmount(r.amount());
        e.setAttribution(o.getAttribution());
        e.setSourceAccountId(o.getAccountId());
        e.setMemo(o.getTitle());
        if (o.getPlanType() == PlanType.SAVINGS) {
          e.setTransactionType(TransactionType.TRANSFER);
          e.setTargetAccountId(o.getTargetAccountId());
        } else {
          e.setTransactionType(TransactionType.EXPENSE);
          e.setCategoryId(o.getCategoryId());
          e.setPaymentMethod(PaymentMethod.ACCOUNT);
        }
        entryId = ledger.create(e, "PLANNED", true).getId();
      }
    }
    o.setState("COMPLETED");
    o.setActualDate(r.date());
    o.setActualAmount(r.amount());
    o.setEntryId(entryId);
    occurrences.update(o);
    return o;
  }

  public void payCard(Long id, Commands.Payment r, Long occurrenceId) {
    ops.lock();
    var c = catalog.card(id);
    check(c.getCardType() == CardType.CREDIT, "신용카드만 카드대금을 입력할 수 있습니다.");
    catalog.activeAccount(c.getAccountId());
    Occurrence occurrence;
    if (occurrenceId == null) {
      var billingMonth = r.billingMonth() == null ? YearMonth.from(r.date()) : r.billingMonth();
      generate(billingMonth);
      occurrence = require(occurrences.findAll().stream()
          .filter(o -> ("CARD:" + id).equals(o.getSourceKey())
              && YearMonth.from(o.getDueDate()).equals(billingMonth))
          .findFirst().orElse(null), "카드 결제 예정");
    } else occurrence = require(occurrences.findById(occurrenceId), "카드 결제 예정");
    check(Objects.equals(occurrence.getCardId(), id) && occurrence.getPlanType() == PlanType.CARD_PAYMENT,
        "카드 결제 예정이 일치하지 않습니다.");
    check("PENDING".equals(occurrence.getState()), "이미 완료 또는 취소된 카드 결제입니다.");
    installmentService.settle(id, occurrence, r);
    ops.changeBalance(c.getAccountId(), r.amount().negate());
    Map<String, Object> row = new HashMap<>();
    row.put("cardId", id);
    row.put("accountId", c.getAccountId());
    row.put("date", r.date());
    row.put("amount", r.amount());
    row.put("occurrenceId", occurrence.getId());
    ops.cardPayment(row);
    occurrence.setState("COMPLETED");
    occurrence.setActualDate(r.date());
    occurrence.setActualAmount(r.amount());
    occurrences.update(occurrence);
  }
}
