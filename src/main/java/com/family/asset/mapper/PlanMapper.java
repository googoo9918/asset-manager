package com.family.asset.mapper;

import com.family.asset.dto.Plan;
import java.util.List;

public interface PlanMapper {
  List<Plan> findAll();

  Plan findById(Long id);

  int insert(Plan value);

  int update(Plan value);
}
