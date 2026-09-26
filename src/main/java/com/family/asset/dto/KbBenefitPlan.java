package com.family.asset.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public final class KbBenefitPlan {
  public record Benefit(@NotBlank @Size(max=100) String name,
      @NotEmpty @Size(max=20) List<@NotBlank @Size(max=200) String> sourceNames,
      @Pattern(regexp="KRW|POINT|MILE|COUNT") @NotNull String unit,
      @NotNull @DecimalMin("0") @Digits(integer=15,fraction=2) BigDecimal limit) {}
  public record Tier(@NotBlank @Size(max=100) String name,
      @NotNull @DecimalMin("0") @Digits(integer=15,fraction=2) BigDecimal minimumSpend,
      @NotNull @Size(max=30) List<@NotNull @Valid Benefit> benefits) {}
  public record Plan(@NotNull Long cardId,@NotBlank @Size(max=200) String sourceCard,
      @NotBlank @Pattern(regexp="\\d{4}-(0[1-9]|1[0-2])") String effectiveMonth,
      @NotEmpty @Size(max=10) List<@NotNull @Valid Tier> tiers,@Min(0) long revision) {}
  public record Stored(Long cardId,String month,String payload,long revision,OffsetDateTime updatedAt) {}
  public record PlanView(Plan plan,long revision) {}
  public record Received(String date,String name,String unit,BigDecimal value) {}
  public record Usage(String month,String sourceCard,BigDecimal currentSpend,BigDecimal previousSpend,
      List<Received> received,boolean complete,List<String> warnings,List<String> archives) {}
  public record BenefitView(Benefit benefit,BigDecimal used,BigDecimal remaining,BigDecimal progress) {}
  public record View(PlanView configuration,String month,Usage usage,Tier appliedTier,Tier earnedTier,
      Tier nextTier,BigDecimal remainingSpend,List<BenefitView> benefits,OffsetDateTime updatedAt,
      String tierMode,String selectedTierName,long tierRevision) {}
  public record TierChoice(String sourceCard,String tierName) {}
  public record SetTier(@NotNull Long cardId,
      @NotBlank @Pattern(regexp="\\d{4}-(0[1-9]|1[0-2])") String month,
      @Size(min=1,max=100) String tierName,
      @NotBlank String planMonth,@Min(1) long planRevision,@Min(0) long revision) {}
  public record Sync(@NotNull Long cardId,@NotBlank @Pattern(regexp="\\d{4}-(0[1-9]|1[0-2])") String month) {}
  public record Apply(@NotBlank String token) {}
}
