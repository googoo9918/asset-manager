package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.time.*;
import lombok.Data;

@Data
public class Card {
  private Long id;
  // 표시 순서는 전용 API로만 변경한다. 일반 계좌/카드 수정에는 반영하지 않는다.
  private Integer displayOrder;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  @NotBlank
  @Size(max = 100)
  private String cardName;

  @NotNull private OwnerCode ownerCode;
  @NotNull private CardType cardType;
  @NotNull private Long accountId;

  @Min(1)
  @Max(31)
  private Integer paymentDay;

  @NotNull private AssetStatus status;
}
