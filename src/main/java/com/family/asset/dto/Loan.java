package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Loan {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  @NotBlank
  @Size(max = 100)
  private String loanName;

  @NotNull private OwnerCode ownerCode;

  @NotNull
  @DecimalMin("0.01")
  @Digits(integer = 22, fraction = 2)
  private BigDecimal initialAmount;

  @NotNull
  @DecimalMin("0")
  @Digits(integer = 22, fraction = 2)
  private BigDecimal currentBalance;

  @NotNull
  @DecimalMin("0")
  private BigDecimal interestRate;

  @NotNull private LocalDate maturityDate;
  @NotNull private RepaymentType repaymentType;

  @NotNull
  @Min(1)
  @Max(31)
  private Integer paymentDay;

  @NotNull private Long accountId;
  @NotNull private AssetStatus status;
}
