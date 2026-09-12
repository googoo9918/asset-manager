package com.family.asset.mapper;

import com.family.asset.dto.Card;
import java.util.List;

public interface CardMapper {
  List<Card> findAll();

  Card findById(Long id);

  int insert(Card value);

  int update(Card value);
}
