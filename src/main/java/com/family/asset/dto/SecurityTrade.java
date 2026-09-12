package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class SecurityTrade {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  private Long accountId;

  private String externalId;

  private LocalDate tradeDate;

  private String tradeType;

  private String symbol;

  private String currencyCode;

  private BigDecimal quantity;

  private BigDecimal amount;

  private BigDecimal exchangeRate;

  private Long entryId;
}
