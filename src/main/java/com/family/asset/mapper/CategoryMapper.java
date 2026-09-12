package com.family.asset.mapper;

import com.family.asset.dto.Category;
import java.util.List;

public interface CategoryMapper {
  List<Category> findAll();

  Category findById(Long id);

  int insert(Category value);

  int update(Category value);
}
