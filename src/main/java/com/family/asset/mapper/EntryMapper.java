package com.family.asset.mapper;

import com.family.asset.dto.Entry;
import java.util.List;

public interface EntryMapper {
  List<Entry> findAll();

  Entry findById(Long id);

  int insert(Entry value);

  int update(Entry value);
}
