Dpackage com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import lombok.Data;

@Data
public class Entry {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;
  @NotNull private LocalDate transactionDate;
  @NotNull private TransactionType transactionType;

  @NotNull
  @DecimalMin("0.01")
  @Digits(integer = 22, fraction = 2)
  private BigDecimal amount;

  @NotNull private Attribution attribution;

  private Long categoryId;

  private PaymentMethod paymentMethod;

  private Long sourceAccountId;

  private Long targetAccountId;

  private Long cardId;

  @Min(1)
  @Max(120)
  private Integer installmentMonths;

  @Size(max = 1000)
  private String memo;

  private String origin;

  private Boolean voided;

  private Long replacesId;
}
