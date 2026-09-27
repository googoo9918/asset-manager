package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Occurrence {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  private String sourceKey;

  private LocalDate dueDate;

  private String title;

  private PlanType planType;

  private Long planId;

  private Long accountId;

  private Long targetAccountId;

  private Long cardId;

  private Long loanId;

  private Attribution attribution;

  private BigDecimal amount;

  private Long categoryId;

  private String state;

  private LocalDate actualDate;

  private BigDecimal actualAmount;

  private Long entryId;
  private Long paymentGroupId;
}
