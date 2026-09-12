package com.family.asset.dto;

import com.family.asset.enums.*;
import jakarta.validation.constraints.*;
import java.time.*;
import lombok.Data;

@Data
public class Category {
  private Long id;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;

  @NotBlank
  @Size(max = 80)
  private String name;

  @NotNull private TransactionType transactionType;

  private Long parentId;
  @NotNull private Boolean active;

  private String systemCode;
}
