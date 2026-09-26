package com.family.asset.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public final class KbBenefit {
  private KbBenefit() {}
  public record Item(@NotBlank @Size(max=200) String name,
      @NotBlank @Pattern(regexp="KRW|POINT|MILE|COUNT") String unit,
      @DecimalMin("0") @Digits(integer=15,fraction=2) BigDecimal limit,
      @DecimalMin("0") @Digits(integer=15,fraction=2) BigDecimal used,
      @Size(max=1000) String condition) {}
  public record Report(@NotNull Long cardId,
      @NotBlank @Pattern(regexp="\\d{4}-\\d{2}") String month,
      @NotBlank @Pattern(regexp="\\d{4}-\\d{2}") String performanceMonth,
      @DecimalMin("0") @Digits(integer=15,fraction=2) BigDecimal recognizedSpend,
      @DecimalMin("0") @Digits(integer=15,fraction=2) BigDecimal targetSpend,
      @NotNull @Size(max=100) List<@Valid Item> benefits,
      @NotNull @Size(max=20) List<@NotBlank @Size(max=150) String> sourceArchives,
      @Size(max=2000) String note,
      @Min(0) long revision,
      @NotNull @AssertTrue Boolean confirmed) {}
  public record Stored(Long cardId,String month,String payload,long revision,OffsetDateTime updatedAt) {}
  public record ItemView(Item item,BigDecimal remaining) {}
  public record View(Report report,long revision,OffsetDateTime updatedAt,BigDecimal remainingSpend,
      BigDecimal progress,List<ItemView> benefits,String sourceMode) {}
}
