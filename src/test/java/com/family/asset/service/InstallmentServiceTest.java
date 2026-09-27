package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.Installment;
import com.family.asset.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class InstallmentServiceTest {
  private Installment installment(String amount, int months) {
    var x = new Installment();
    x.setId(1L); x.setRemainingAmount(new BigDecimal(amount)); x.setRemainingMonths(months);
    x.setFirstPaymentDate(LocalDate.of(2028,1,31));
    return x;
  }
  @Test void preservesTotalAndRestoresPaymentDayAfterFebruary() {
    var rows = InstallmentService.calculate(installment("100.00",3),31);
    assertEquals(LocalDate.of(2028,2,29),rows.get(1).getDueDate());
    assertEquals(LocalDate.of(2028,3,31),rows.get(2).getDueDate());
    assertEquals(new BigDecimal("33.33"),rows.get(0).getAmount());
    assertEquals(new BigDecimal("33.34"),rows.get(2).getAmount());
    assertEquals(new BigDecimal("100.00"),rows.stream().map(r->r.getAmount()).reduce(BigDecimal.ZERO,BigDecimal::add));
  }
  @Test void singlePaymentConsumesExactBalance() {
    assertEquals(new BigDecimal("300000.01"),InstallmentService.calculate(installment("300000.01",1),31).getFirst().getAmount());
  }
  @Test void rejectsEmptyOrUnrepresentableMonthlyAmount() {
    assertThrows(BusinessException.class,()->InstallmentService.calculate(installment("0",3),31));
    assertThrows(BusinessException.class,()->InstallmentService.calculate(installment("100",0),31));
    assertThrows(BusinessException.class,()->InstallmentService.calculate(installment("0.01",3),31));
  }
  @Test void acceptsDisplayedWholeWonButNotTrueUnderpayments() {
    assertTrue(InstallmentService.coversTotal(new BigDecimal("33333"),new BigDecimal("33333.33")));
    assertTrue(InstallmentService.coversTotal(new BigDecimal("33333.00"),new BigDecimal("33333.49")));
    assertFalse(InstallmentService.coversTotal(new BigDecimal("33333"),new BigDecimal("33333.50")));
    assertTrue(InstallmentService.coversTotal(new BigDecimal("33334"),new BigDecimal("33333.50")));
    assertFalse(InstallmentService.coversTotal(new BigDecimal("33332"),new BigDecimal("33333.33")));
    assertFalse(InstallmentService.coversTotal(new BigDecimal("33333.01"),new BigDecimal("33333.33")));
    assertTrue(InstallmentService.coversTotal(new BigDecimal("33333.33"),new BigDecimal("33333.33")));
    assertFalse(InstallmentService.coversTotal(new BigDecimal("199.99"),new BigDecimal("200.00")));
    assertTrue(InstallmentService.coversTotal(new BigDecimal("9007199254740993"),new BigDecimal("9007199254740993.33")));
  }
}
