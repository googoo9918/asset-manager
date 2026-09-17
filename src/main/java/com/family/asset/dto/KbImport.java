package com.family.asset.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class KbImport {
  private KbImport() {}
  public record Row(
      @NotNull LocalDate date,
      @NotBlank @Size(max=200) String merchant,
      @NotNull @Digits(integer=22, fraction=2) BigDecimal amount,
      @NotBlank @Pattern(regexp="APPROVED|CANCELLED|UNKNOWN") String status,
      @Min(1) @Max(120) int installmentMonths,
      @Size(max=100) String approvalNumber, Boolean pointPayment, @Size(max=200) String industry) {
    public Row(LocalDate date, String merchant, BigDecimal amount, String status, int installmentMonths, String approvalNumber, Boolean pointPayment) {
      this(date, merchant, amount, status, installmentMonths, approvalNumber, pointPayment, null);
    }
    public Row(LocalDate date, String merchant, BigDecimal amount, String status, int installmentMonths, String approvalNumber) {
      this(date, merchant, amount, status, installmentMonths, approvalNumber, false);
    }
  }
  public record Mapping(@NotBlank @Size(max=200) String sourceCard, @NotNull Long cardId,
      @NotNull Long accountId, boolean pointPayment) {}
  public record Preview(@NotNull Long cardId, @NotEmpty @Size(max=500) List<@Valid Row> rows,
      @Size(max=200) String sourceCard) {
    public Preview(Long cardId, List<Row> rows) { this(cardId, rows, null); }
  }
  public record Selection(@Min(0) int index, @NotNull Long categoryId, boolean remember) {}
  public record Commit(@NotBlank String previewId, Long categoryId,
      @NotEmpty @Size(max=500) List<@Min(0) Integer> indices,
      @NotNull Boolean affectBalance, @Size(max=500) List<@Valid Selection> selections,
      @NotNull @AssertTrue Boolean confirmed) {
    public Commit(String previewId, Long categoryId, List<Integer> indices, Boolean affectBalance) {
      this(previewId,categoryId,indices,affectBalance,null,true);
    }
  }
  public record File(@NotBlank @Size(max=200) String name,
      @NotBlank @Size(max=7000000) String base64) {}
  public record Checked(int index, Row row, String status, String reason, Long categoryId, String categoryReason) {}
  public record Result(String previewId, List<Checked> rows) {}
}
