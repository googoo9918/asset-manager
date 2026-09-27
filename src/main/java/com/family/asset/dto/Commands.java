package com.family.asset.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class Commands {
  private Commands() {}

  public record Batch(@NotEmpty @Size(max = 100) List<@Valid Entry> entries) {}

  public record Adjustment(
      @NotNull @Digits(integer = 22, fraction = 2) BigDecimal balance,
      @NotBlank @Size(max = 1000) String reason) {}

  public record Payment(
      @NotNull LocalDate date,
      @NotNull @DecimalMin("0.01") @Digits(integer = 22, fraction = 2) BigDecimal amount,
      java.time.YearMonth billingMonth) {
    public Payment(LocalDate date, BigDecimal amount) { this(date, amount, null); }
  }

  public record Repayment(
      @NotNull LocalDate date,
      @NotNull @DecimalMin("0") @Digits(integer = 22, fraction = 2) BigDecimal principal,
      @NotNull @DecimalMin("0") @Digits(integer = 22, fraction = 2) BigDecimal interest,
      @NotNull @DecimalMin("0") @Digits(integer = 22, fraction = 2) BigDecimal fee,
      @NotNull Long accountId,
      boolean early) {}

  public record Rate(
      @NotNull LocalDate effectiveDate,
      @NotNull @DecimalMin("0") @Digits(integer = 4, fraction = 8) BigDecimal rate) {}

  public record Confirm(
      @NotNull LocalDate date,
      @NotNull @DecimalMin("0.01") @Digits(integer = 22, fraction = 2) BigDecimal amount,
      @DecimalMin("0") @Digits(integer = 22, fraction = 2) BigDecimal principal,
      @DecimalMin("0") @Digits(integer = 22, fraction = 2) BigDecimal interest) {}

  public record AccountCardPayment(
      @NotNull Long accountId,
      @NotEmpty List<@NotNull Long> occurrenceIds,
      @NotNull LocalDate date,
      @NotNull @DecimalMin("0.01") @Digits(integer = 22, fraction = 2) BigDecimal amount) {}

  public record OccurrenceGroup(@NotNull Long accountId, @NotEmpty List<@NotNull Long> occurrenceIds,
      @NotNull LocalDate date) {}

  public record ScheduleRow(
      LocalDate date,
      BigDecimal principal,
      BigDecimal interest,
      BigDecimal total,
      BigDecimal balance) {}
}
