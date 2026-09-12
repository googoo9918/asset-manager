package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Account {
  private Long id;
  // 표시 순서는 전용 API로만 변경한다. 일반 계좌/카드 수정에는 반영하지 않는다.
  private Integer displayOrder;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;
  @NotNull private AssetType assetType;
  @NotNull private OwnerCode ownerCode;
  @NotNull private FinancialInstitution institutionCode;

  @NotBlank
  @Size(max = 100)
  private String accountName;

  @NotBlank
  @Size(max = 60)
  private String accountNumber;

  @NotNull
  @Digits(integer = 22, fraction = 2)
  private BigDecimal currentBalanceKrw;

  @NotBlank
  @Pattern(regexp = "KRW")
  private String currencyCode;

  @NotNull private AssetStatus status;
  @NotNull private Boolean kisLinked;

  private LocalDate startDate;

  private LocalDate maturityDate;

  @DecimalMin("0")
  private BigDecimal interestRate;

  @DecimalMin("0.01")
  @Digits(integer = 22, fraction = 2)
  private BigDecimal monthlyAmount;

  @Min(1)
  @Max(31)
  private Integer paymentDay;

  private Long withdrawalAccountId;

  private BigDecimal depositKrw;

  private BigDecimal depositUsd;

  private BigDecimal exchangeRate;

  private OffsetDateTime lastSyncedAt;
}
