package com.family.asset.mapper;

import com.family.asset.dto.Occurrence;
import java.util.List;

public interface OccurrenceMapper {
  List<Occurrence> findAll();

  Occurrence findById(Long id);

  int insert(Occurrence value);

  int update(Occurrence value);
}
