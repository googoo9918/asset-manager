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
public class CatalogService {
  private final AccountMapper accounts;
  private final CardMapper cards;
  private final LoanMapper loans;
  private final CategoryMapper categories;
  private final PlanMapper plans;
  private final InstallmentMapper installments;
  private final OperationMapper ops;
  private final InstallmentService installmentService;

  public Account account(Long id) {
    return require(accounts.findById(id), "계좌");
  }

  public Account activeAccount(Long id) {
    var a = account(id);
    check(a.getStatus() == AssetStatus.ACTIVE, "해지된 계좌는 사용할 수 없습니다.");
    return a;
  }

  public Card card(Long id) {
    return require(cards.findById(id), "카드");
  }

  public Loan loan(Long id) {
    return require(loans.findById(id), "대출");
  }

  public List<Account> accounts() {
    return accounts.findAll();
  }

  public List<Card> cards() {
    return cards.findAll();
  }

  public List<Loan> loans() {
    return loans.findAll();
  }

  public List<Category> categories() {
    return categories.findAll();
  }

  public List<Plan> plans() {
    return plans.findAll();
  }

  public List<Installment> installments() {
    return installments.findAll();
  }

  public List<Map<String, Object>> adjustments(Long id) {
    account(id);
    return ops.adjustments(id);
  }

  public List<Map<String, Object>> cardPayments(Long id) {
    card(id);
    return ops.cardPayments(id);
  }

  public List<Map<String, Object>> repayments(Long id) {
    loan(id);
    return ops.repayments(id);
  }

  public List<Map<String, Object>> rates(Long id) {
    loan(id);
    return ops.rates(id);
  }

  public Account saveAccount(Long id, Account a) {
    ops.lock();
    if (a.getAssetType() == AssetType.SAVINGS) {
      check(
          a.getStartDate() != null
              && a.getMaturityDate() != null
              && !a.getMaturityDate().isBefore(a.getStartDate()),
          "적금 가입일·만기일을 확인해주세요.");
      check(
          a.getMonthlyAmount() != null
              && a.getMonthlyAmount().signum() > 0
              && a.getPaymentDay() != null
              && a.getInterestRate() != null,
          "적금 금리·월 납입액·납입일은 필수입니다.");
      check(
          !Objects.equals(id, a.getWithdrawalAccountId()) || id == null, "출금계좌와 적금계좌가 같을 수 없습니다.");
      check(
          activeAccount(a.getWithdrawalAccountId()).getAssetType() == AssetType.CASH,
          "적금 출금계좌는 현금성 계좌여야 합니다.");
    }
    check(
        !Boolean.TRUE.equals(a.getKisLinked())
            || (a.getAssetType() == AssetType.SECURITIES
                && a.getInstitutionCode() == FinancialInstitution.KIS),
        "KIS 연동은 한국투자증권 계좌에서만 가능합니다.");
    if (id == null) {
      check(a.getStatus() == AssetStatus.ACTIVE, "신규 계좌는 사용중 상태로 등록해주세요.");
      a.setId(null);
      a.setDepositKrw(
          a.getAssetType() == AssetType.SECURITIES ? a.getCurrentBalanceKrw() : BigDecimal.ZERO);
      a.setDepositUsd(BigDecimal.ZERO);
      a.setExchangeRate(BigDecimal.ONE);
      a.setLastSyncedAt(null);
      accounts.insert(a);
    } else {
      var old = account(id);
      check(a.getStatus() == old.getStatus(), "계좌 해지는 해지 기능을 이용해주세요.");
      check(a.getAssetType() == old.getAssetType(), "계좌 유형은 변경할 수 없습니다.");
      check(a.getOwnerCode() == old.getOwnerCode(), "과거 이력 보호를 위해 계좌 소유자는 변경할 수 없습니다.");
      check(
          a.getCurrentBalanceKrw().compareTo(old.getCurrentBalanceKrw()) == 0,
          "잔액 변경은 잔액 보정 기능을 이용해주세요.");
      a.setId(id);
      a.setDepositKrw(old.getDepositKrw());
      a.setDepositUsd(old.getDepositUsd());
      a.setExchangeRate(old.getExchangeRate());
      a.setLastSyncedAt(old.getLastSyncedAt());
      accounts.update(a);
    }
    if (a.getStatus() == AssetStatus.CLOSED) ops.cancelPending("SAVINGS:" + a.getId());
    return account(a.getId());
  }

  public Account adjust(Long id, Commands.Adjustment r) {
    ops.lock();
    var a = activeAccount(id);
    check(!a.getKisLinked(), "KIS 연동 계좌의 현재 잔액은 API 갱신으로 관리합니다.");
    ops.adjustment(
        Map.of(
            "accountId",
            id,
            "oldBalance",
            a.getCurrentBalanceKrw(),
            "newBalance",
            r.balance(),
            "reason",
            r.reason()));
    ops.changeBalance(id, r.balance().subtract(a.getCurrentBalanceKrw()));
    return account(id);
  }

  public void closeAccount(Long id) {
    ops.lock();
    var a = account(id);
    check(a.getCurrentBalanceKrw().signum() == 0, "잔액을 이전하거나 보정한 후 해지해주세요.");
    check(
        cards().stream()
            .noneMatch(c -> c.getStatus() == AssetStatus.ACTIVE && c.getAccountId().equals(id)),
        "사용중인 카드의 결제계좌를 먼저 변경해주세요.");
    check(
        loans().stream()
            .noneMatch(l -> l.getStatus() == AssetStatus.ACTIVE && l.getAccountId().equals(id)),
        "대출 출금계좌를 먼저 변경해주세요.");
    check(
        accounts().stream()
            .noneMatch(
                x ->
                    x.getStatus() == AssetStatus.ACTIVE
                        && Objects.equals(x.getWithdrawalAccountId(), id)),
        "적금 출금계좌를 먼저 변경해주세요.");
    check(
        plans().stream().noneMatch(p -> p.getActive() && Objects.equals(p.getAccountId(), id)),
        "활성 반복 지출의 출금계좌를 먼저 변경하거나 비활성화해주세요.");
    a.setStatus(AssetStatus.CLOSED);
    accounts.update(a);
    ops.cancelPending("SAVINGS:" + id);
  }

  public Card saveCard(Long id, Card c) {
    ops.lock();
    check(
        activeAccount(c.getAccountId()).getAssetType() == AssetType.CASH, "카드 결제계좌는 현금성 계좌여야 합니다.");
    check(c.getCardType() != CardType.CREDIT || c.getPaymentDay() != null, "신용카드 결제일을 입력해주세요.");
    if (c.getCardType() == CardType.DEBIT) c.setPaymentDay(null);
    CardBillingService.validate(c);
    c.setId(id);
    if (id == null) cards.insert(c);
    else {
      var old = card(id);
      if (c.getStatus() == AssetStatus.CLOSED) checkNoActiveInstallments(id);
      check(
          old.getCardType() == c.getCardType() && old.getOwnerCode() == c.getOwnerCode(),
          "카드 유형과 소유자는 변경할 수 없습니다.");
      cards.update(c);
    }
    if (c.getStatus() == AssetStatus.CLOSED) ops.cancelPending("CARD:" + c.getId());
    return card(c.getId());
  }

  public void closeCard(Long id) {
    ops.lock();
    checkNoActiveInstallments(id);
    var c = card(id);
    c.setStatus(AssetStatus.CLOSED);
    cards.update(c);
    ops.cancelPending("CARD:" + id);
  }

  private void checkNoActiveInstallments(Long cardId) {
    check(installments().stream().noneMatch(x -> x.getActive() && x.getCardId().equals(cardId)),
        "진행 중인 할부를 완납하거나 비활성화한 후 카드를 해지해주세요.");
  }

  public Loan saveLoan(Long id, Loan l) {
    ops.lock();
    check(
        activeAccount(l.getAccountId()).getAssetType() == AssetType.CASH, "대출 출금계좌는 현금성 계좌여야 합니다.");
    check(
        l.getCurrentBalance().compareTo(l.getInitialAmount()) <= 0, "현재 대출잔액은 최초 대출금액보다 클 수 없습니다.");
    l.setId(id);
    if (id == null) {
      check(l.getStatus() == AssetStatus.ACTIVE, "신규 대출은 사용중 상태로 등록해주세요.");
      loans.insert(l);
    } else {
      var old = loan(id);
      check(l.getStatus() == old.getStatus(), "대출 종료는 종료 기능을 이용해주세요.");
      check(
          l.getCurrentBalance().compareTo(old.getCurrentBalance()) == 0, "대출잔액 변경은 상환 기능을 이용해주세요.");
      check(l.getInterestRate().compareTo(old.getInterestRate()) == 0, "금리는 금리 변경 기능을 이용해주세요.");
      check(l.getOwnerCode() == old.getOwnerCode(), "대출 소유자는 변경할 수 없습니다.");
      loans.update(l);
    }
    return loan(l.getId());
  }

  public void closeLoan(Long id) {
    ops.lock();
    var l = loan(id);
    check(l.getCurrentBalance().signum() == 0, "잔액이 있는 대출은 종료할 수 없습니다.");
    l.setStatus(AssetStatus.CLOSED);
    loans.update(l);
    ops.cancelPending("LOAN:" + id);
  }

  public Category saveCategory(Long id, Category c) {
    ops.lock();
    check(c.getTransactionType() != TransactionType.TRANSFER, "자산이동은 카테고리를 사용하지 않습니다.");
    if (c.getParentId() != null) {
      var p = require(categories.findById(c.getParentId()), "대분류");
      check(
          p.getParentId() == null
              && p.getTransactionType() == c.getTransactionType()
              && p.getActive(),
          "활성화된 동일 유형 대분류를 선택해주세요.");
      check(!c.getParentId().equals(id), "자기 자신을 상위 카테고리로 지정할 수 없습니다.");
    }
    c.setId(id);
    c.setSystemCode(null);
    if (id == null) categories.insert(c);
    else {
      var old = require(categories.findById(id), "카테고리");
      check(old.getSystemCode() == null, "기본 시스템 카테고리는 변경할 수 없습니다.");
      check(
          Objects.equals(c.getParentId(), old.getParentId())
              && c.getTransactionType() == old.getTransactionType(),
          "사용 이력 보호를 위해 카테고리 계층/유형은 변경할 수 없습니다.");
      categories.update(c);
    }
    return c;
  }

  public void deactivateCategory(Long id) {
    ops.lock();
    var c = require(categories.findById(id), "카테고리");
    check(c.getSystemCode() == null, "시스템 카테고리는 비활성화할 수 없습니다.");
    check(
        categories().stream().noneMatch(x -> Objects.equals(x.getParentId(), id) && x.getActive()),
        "소분류를 먼저 비활성화해주세요.");
    c.setActive(false);
    categories.update(c);
  }

  public Category categoryFor(Long id, TransactionType type) {
    var c = require(categories.findById(id), "카테고리");
    check(c.getActive() && c.getTransactionType() == type, "거래 유형에 맞는 활성 카테고리를 선택해주세요.");
    return c;
  }

  public Long systemCategory(String code) {
    return categories().stream()
        .filter(c -> code.equals(c.getSystemCode()))
        .findFirst()
        .orElseThrow(
            () -> new com.family.asset.exception.BusinessException("초기 코드 데이터(seed.sql)를 실행해주세요."))
        .getId();
  }

  public Plan savePlan(Long id, Plan p) {
    ops.lock();
    check(p.getPlanType() == PlanType.EXPENSE, "카드·대출·적금 예정은 해당 정보에서 자동 생성됩니다.");
    check(p.getAmount() != null && p.getAmount().signum() > 0, "예정 지출금액을 입력해주세요.");
    categoryFor(p.getCategoryId(), TransactionType.EXPENSE);
    activeAccount(p.getAccountId());
    check(
        p.getEndDate() == null || !p.getEndDate().isBefore(p.getStartDate()), "종료일은 시작일 이후여야 합니다.");
    p.setCardId(null);
    p.setLoanId(null);
    p.setTargetAccountId(null);
    p.setId(id);
    if (id == null) plans.insert(p);
    else {
      require(plans.findById(id), "반복 예정");
      plans.update(p);
    }
    return p;
  }

  public void deactivatePlan(Long id) {
    ops.lock();
    var p = require(plans.findById(id), "반복 예정");
    p.setActive(false);
    plans.update(p);
    ops.cancelPending("PLAN:" + id);
  }

  public Installment saveInstallment(Long id, Installment x) {
    ops.lock();
    var c = card(x.getCardId());
    check(c.getCardType() == CardType.CREDIT && c.getStatus() == AssetStatus.ACTIVE,
        "기존 할부는 사용 중인 신용카드만 선택할 수 있습니다.");
    check(x.getRemainingMonths() > 0 && x.getRemainingAmount().signum() > 0,
        "잔여 개월과 금액은 0보다 커야 합니다.");
    if (x.getFirstPaymentDate() == null) {
      var today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul"));
      var month = java.time.YearMonth.from(today);
      var due = LoanService.day(month, c.getPaymentDay());
      x.setFirstPaymentDate(due.isBefore(today) ? LoanService.day(month.plusMonths(1), c.getPaymentDay()) : due);
    }
    check(x.getFirstPaymentDate().equals(LoanService.day(java.time.YearMonth.from(x.getFirstPaymentDate()), c.getPaymentDay())),
        "첫 결제일은 카드 결제일과 일치해야 합니다.");
    check(!x.getFirstPaymentDate().isBefore(c.getCreatedAt().atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).toLocalDate()),
        "첫 결제일은 카드 등록일 이후여야 합니다.");
    x.setId(id);
    if (id == null) installments.insert(x);
    else {
      var old = require(installments.findById(id), "기존 할부");
      check(old.getCardId().equals(x.getCardId()), "할부의 카드는 변경할 수 없습니다.");
      check(installmentService.list().stream().noneMatch(s -> id.equals(s.getInstallmentId()) && "PAID".equals(s.getState())),
          "납부 이력이 있는 할부는 수정할 수 없습니다. 비활성화 후 남은 회차를 새로 등록해주세요.");
      installments.update(x);
    }
    installmentService.rebuild(x, c.getPaymentDay());
    return x;
  }

  public void deactivateInstallment(Long id) {
    ops.lock();
    var x = require(installments.findById(id), "기존 할부");
    x.setActive(false);
    installments.update(x);
    installmentService.deactivate(x);
  }
}
