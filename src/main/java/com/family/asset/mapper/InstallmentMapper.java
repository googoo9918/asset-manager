package com.family.asset.mapper;

import com.family.asset.dto.Installment;
import java.util.List;

public interface InstallmentMapper {
  List<Installment> findAll();

  Installment findById(Long id);

  int insert(Installment value);

  int update(Installment value);
}
