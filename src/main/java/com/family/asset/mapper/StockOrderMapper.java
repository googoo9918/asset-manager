package com.family.asset.mapper;

import com.family.asset.dto.StockOrder;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface StockOrderMapper {
  StockOrder find(String id);
  List<StockOrder> list(@Param("owner") String owner);
  int insert(StockOrder order);
  int claimSubmit(@Param("id") String id, @Param("version") int version);
  int claimCancel(@Param("id") String id, @Param("version") int version);
  int update(StockOrder order);
  int unresolved(Long accountId);
}
