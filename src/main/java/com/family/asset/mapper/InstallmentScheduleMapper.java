package com.family.asset.mapper;

import com.family.asset.dto.InstallmentSchedule;
import java.util.List;

public interface InstallmentScheduleMapper {
  List<InstallmentSchedule> findAll();
  int insert(InstallmentSchedule row);
  int update(InstallmentSchedule row);
  int cancelPending(Long installmentId);
}
