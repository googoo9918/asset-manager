package com.family.asset.mapper;

import com.family.asset.dto.KbBenefit;
import java.util.List;
import org.apache.ibatis.annotations.*;

public interface KbBenefitMapper {
  @Select("SELECT card_id,month,data::text AS payload,revision,updated_at FROM kb_benefit_report WHERE month=#{month} ORDER BY card_id")
  List<KbBenefit.Stored> list(String month);
  @Select("SELECT card_id,month,data::text AS payload,revision,updated_at FROM kb_benefit_report WHERE card_id=#{cardId} AND month=#{month}")
  KbBenefit.Stored find(@Param("cardId") Long cardId,@Param("month") String month);
  @Insert("INSERT INTO kb_benefit_report(card_id,month,data) VALUES(#{cardId},#{month},CAST(#{payload} AS jsonb)) ON CONFLICT(card_id,month) DO UPDATE SET data=excluded.data,revision=kb_benefit_report.revision+1,updated_at=now()")
  void save(@Param("cardId") Long cardId,@Param("month") String month,@Param("payload") String payload);
}
