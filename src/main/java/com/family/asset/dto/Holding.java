package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Holding {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  private Long accountId;

  private String symbol;

  private String name;

  private String currencyCode;

  private BigDecimal quantity;

  private BigDecimal averagePrice;

  private BigDecimal currentPrice;

  private BigDecimal valueNative;

  private BigDecimal valueKrw;

  private BigDecimal exchangeRate;
}
