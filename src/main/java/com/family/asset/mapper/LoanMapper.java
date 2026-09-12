package com.family.asset.mapper;

import com.family.asset.dto.Loan;
import java.util.List;

public interface LoanMapper {
  List<Loan> findAll();

  Loan findById(Long id);

  int insert(Loan value);

  int update(Loan value);
}
