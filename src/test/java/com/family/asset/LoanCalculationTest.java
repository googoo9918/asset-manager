package com.family.asset;

import static org.assertj.core.api.Assertions.*;

import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.service.LoanService;
import java.math.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class LoanCalculationTest {
  Loan loan(RepaymentType type, String rate) {
    var l = new Loan();
    l.setCurrentBalance(new BigDecimal("1200000.00"));
    l.setInterestRate(new BigDecimal(rate));
    l.setRepaymentType(type);
    l.setPaymentDay(31);
    l.setMaturityDate(LocalDate.of(2027, 8, 31));
    return l;
  }

  @Test
  void zeroInterestAnnuityRepaysExactPrincipal() {
    var rows =
        LoanService.calculate(
            loan(RepaymentType.ANNUITY, "0"), LocalDate.of(2026, 9, 1), List.of());
    assertThat(rows).hasSize(12);
    assertThat(
            rows.stream()
                .map(Commands.ScheduleRow::principal)
                .reduce(BigDecimal.ZERO, BigDecimal::add))
        .isEqualByComparingTo("1200000");
    assertThat(rows.getLast().balance()).isEqualByComparingTo("0");
    assertThat(rows.get(5).date()).isEqualTo(LocalDate.of(2027, 2, 28));
  }

  @Test
  void bulletKeepsPrincipalUntilMaturity() {
    var rows =
        LoanService.calculate(
            loan(RepaymentType.BULLET, "12"), LocalDate.of(2026, 9, 1), List.of());
    assertThat(rows.getFirst().principal()).isEqualByComparingTo("0");
    assertThat(rows.getFirst().interest()).isEqualByComparingTo("12000");
    assertThat(rows.getLast().principal()).isEqualByComparingTo("1200000");
  }

  @Test
  void rateChangeOnlyAffectsFutureRows() {
    var changes =
        List.<Map<String, Object>>of(
            Map.of("effective_date", LocalDate.of(2027, 1, 1), "new_rate", new BigDecimal("6")));
    var rows =
        LoanService.calculate(loan(RepaymentType.BULLET, "12"), LocalDate.of(2026, 9, 1), changes);
    assertThat(rows.get(3).interest()).isEqualByComparingTo("12000");
    assertThat(rows.get(4).interest()).isEqualByComparingTo("6000");
  }

  @Test
  void annuityEndsWithoutRoundingResidual() {
    var rows =
        LoanService.calculate(
            loan(RepaymentType.ANNUITY, "3.9"), LocalDate.of(2026, 9, 1), List.of());
    assertThat(rows.getLast().balance()).isEqualByComparingTo("0");
    assertThat(
            rows.stream()
                .map(Commands.ScheduleRow::principal)
                .reduce(BigDecimal.ZERO, BigDecimal::add))
        .isEqualByComparingTo("1200000");
  }
}
