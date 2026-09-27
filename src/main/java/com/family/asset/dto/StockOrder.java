package com.family.asset.dto;

import java.math.BigDecimal;
import java.time.*;
import lombok.Data;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Data
public class StockOrder {
  private String id;
  private Long accountId;
  private String accountName;
  private String ownerCode;
  @JsonIgnore private String accountBinding;
  private String environment;
  private String exchange;
  private String symbol;
  private String side;
  private String orderType;
  private BigDecimal quantity;
  private BigDecimal price;
  private BigDecimal quotePrice;
  private OffsetDateTime quotedAt;
  private OffsetDateTime expiresAt;
  private OffsetDateTime createdAt;
  private LocalDate orderDate;
  private String status;
  private String brokerOrderId;
  private String brokerBranch;
  private String cancelOrderId;
  private BigDecimal filledQuantity;
  private BigDecimal remainingQuantity;
  private BigDecimal averageFillPrice;
  private String message;
  private int version;
}
