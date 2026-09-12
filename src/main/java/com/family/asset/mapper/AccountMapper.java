package com.family.asset.mapper;

import com.family.asset.dto.Account;
import java.util.List;

public interface AccountMapper {
  List<Account> findAll();

  Account findById(Long id);

  int insert(Account value);

  int update(Account value);
}
