package com.family.asset.mapper;

import org.apache.ibatis.annotations.Param;

public interface DisplayOrderMapper {
  int updateAccount(@Param("id") Long id, @Param("position") int position);
  int updateCard(@Param("id") Long id, @Param("position") int position);
}
