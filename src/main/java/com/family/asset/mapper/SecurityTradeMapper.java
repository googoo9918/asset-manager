package com.family.asset.mapper;

import com.family.asset.dto.SecurityTrade;
import java.util.List;

public interface SecurityTradeMapper {
  List<SecurityTrade> findAll();

  SecurityTrade findById(Long id);

  int insert(SecurityTrade value);

  int update(SecurityTrade value);
}
