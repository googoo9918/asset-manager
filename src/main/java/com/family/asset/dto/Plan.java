package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Plan {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  @NotBlank
  @Size(max = 100)
  private String title;

  @NotNull private PlanType planType;
  @NotNull private RepeatCycle repeatCycle;
  @NotNull private LocalDate startDate;

  private LocalDate endDate;

  @DecimalMin("0.01")
  @Digits(integer = 22, fraction = 2)
  private BigDecimal amount;

  @NotNull private Attribution attribution;

  private Long categoryId;

  private Long accountId;

  private Long targetAccountId;

  private Long cardId;

  private Long loanId;
  @NotNull private Boolean active;
}
