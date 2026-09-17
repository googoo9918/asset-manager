package com.family.asset.mapper;

import org.apache.ibatis.annotations.*;

public interface KbImportMapper {
  @Select("SELECT category_id FROM kb_category_rule WHERE merchant_key=#{merchant} AND industry_key=#{industry}")
  Long categoryRule(@Param("merchant") String merchant, @Param("industry") String industry);
  @Insert("INSERT INTO kb_category_rule(merchant_key,industry_key,category_id) VALUES(#{merchant},#{industry},#{category}) ON CONFLICT(merchant_key,industry_key) DO UPDATE SET category_id=excluded.category_id")
  void saveCategoryRule(@Param("merchant") String merchant, @Param("industry") String industry, @Param("category") Long category);
  @Select("SELECT source_card,card_id,account_id,point_payment FROM kb_card_mapping ORDER BY source_card")
  java.util.List<com.family.asset.dto.KbImport.Mapping> mappings();
  @Select("SELECT source_card,card_id,account_id,point_payment FROM kb_card_mapping WHERE source_card=#{source}")
  com.family.asset.dto.KbImport.Mapping mapping(String source);
  @Insert("INSERT INTO kb_card_mapping(source_card,card_id,account_id,point_payment) VALUES(#{sourceCard},#{cardId},#{accountId},#{pointPayment}) ON CONFLICT(source_card) DO UPDATE SET card_id=excluded.card_id,account_id=excluded.account_id,point_payment=excluded.point_payment")
  void saveMapping(com.family.asset.dto.KbImport.Mapping mapping);
  @Select("SELECT to_regclass('kb_card_import') IS NOT NULL")
  boolean ready();
  @Select("SELECT entry_id FROM kb_card_import WHERE card_id=#{cardId} AND source_key=#{key}")
  Long find(@Param("cardId") Long cardId, @Param("key") String key);
  @Insert("INSERT INTO kb_card_import(card_id,source_key,entry_id) VALUES(#{cardId},#{key},#{entryId})")
  void insert(@Param("cardId") Long cardId, @Param("key") String key, @Param("entryId") Long entryId);
}
