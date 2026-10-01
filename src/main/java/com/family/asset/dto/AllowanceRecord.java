package com.family.asset.dto;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.Data;
@Data
public class AllowanceRecord {
 private Long id;
 private String ownerCode;
 private LocalDate recordDate;
 private BigDecimal amount;
 private String memo;
 private Long sourceEntryId;
 private String requestId;
 private Boolean active;
}
