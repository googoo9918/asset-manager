package com.family.asset.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.Data;

@Data
public class InstallmentSchedule {
  private Long id;
  private Long installmentId;
  private LocalDate dueDate;
  private BigDecimal amount;
  private String state;
  private Long occurrenceId;
  private LocalDate paidDate;
}
