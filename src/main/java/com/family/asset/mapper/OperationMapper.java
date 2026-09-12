package com.family.asset.mapper;

import java.math.BigDecimal;
import java.util.*;
import org.apache.ibatis.annotations.Param;

public interface OperationMapper {
  Long lock();

  int changeBalance(@Param("id") Long id, @Param("delta") BigDecimal delta);

  int effect(
      @Param("entryId") Long entryId,
      @Param("accountId") Long accountId,
      @Param("delta") BigDecimal delta);

  List<Map<String, Object>> effects(Long id);

  int adjustment(Map<String, Object> row);

  List<Map<String, Object>> adjustments(Long id);

  int cardPayment(Map<String, Object> row);

  List<Map<String, Object>> cardPayments(Long id);

  int repayment(Map<String, Object> row);

  List<Map<String, Object>> repayments(Long id);

  int rate(Map<String, Object> row);

  List<Map<String, Object>> rates(Long id);

  int clearHoldings(Long id);

  int snapshot(Map<String, Object> row);

  int snapshotItem(Map<String, Object> row);

  List<Map<String, Object>> snapshots();

  List<Map<String, Object>> snapshotItems(Long id);

  int cancelPending(@Param("key") String key);
}
