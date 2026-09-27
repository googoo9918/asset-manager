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

  private String exchangeCode;
  // Snapshot label: survives account renaming/closure without looking up current metadata.
  private String accountName;
  private LocalDate priceDate;
  private LocalDate previousPriceDate;
  private BigDecimal previousClose;
  private BigDecimal dayPrice;
  private BigDecimal dailyReturn;
  private OffsetDateTime priceFetchedAt;
}
