package com.family.asset.mapper;

import com.family.asset.dto.Holding;
import java.util.List;

public interface HoldingMapper {
  List<Holding> findAll();

  Holding findById(Long id);

  int insert(Holding value);

  int update(Holding value);
}
