package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Installment {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;
  @NotNull private Long cardId;
  private Long sourceEntryId;

  @NotNull
  @Min(0)
  @Max(120)
  private Integer remainingMonths;

  @NotNull
  @DecimalMin("0")
  @Digits(integer = 22, fraction = 2)
  private BigDecimal remainingAmount;

  private LocalDate firstPaymentDate;

  @Size(max = 1000)
  private String memo;

  @NotNull private Boolean active;
}
