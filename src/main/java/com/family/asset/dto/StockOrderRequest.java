package com.family.asset.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record StockOrderRequest(@NotNull Long accountId,
    @NotNull @Pattern(regexp="KRX|NASD|NYSE|AMEX") String exchange,
    @NotBlank @Pattern(regexp="[A-Z0-9][A-Z0-9.\\-]{0,19}") String symbol,
    @NotNull @Pattern(regexp="BUY|SELL") String side,
    @NotNull @Pattern(regexp="LIMIT|CURRENT|MARKET") String orderType,
    @NotNull @DecimalMin("1") @Digits(integer=9,fraction=0) BigDecimal quantity,
    @DecimalMin("0.0001") @Digits(integer=16,fraction=4) BigDecimal price) {}
