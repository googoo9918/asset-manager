package com.family.asset.mapper;

import com.family.asset.dto.KbBenefitPlan.Stored;
import java.util.List;
import org.apache.ibatis.annotations.*;

public interface KbBenefitPlanMapper {
  @Select("SELECT card_id,month,data::text AS payload,revision,updated_at FROM kb_benefit_tier_choice WHERE card_id=#{cardId} AND month=#{month}")
  Stored tierChoice(@Param("cardId") Long cardId,@Param("month") String month);
  @Insert("INSERT INTO kb_benefit_tier_choice(card_id,month,data) VALUES(#{cardId},#{month},CAST(#{payload} AS jsonb)) ON CONFLICT(card_id,month) DO UPDATE SET data=excluded.data,revision=kb_benefit_tier_choice.revision+1,updated_at=now()")
  void saveTierChoice(@Param("cardId") Long cardId,@Param("month") String month,@Param("payload") String payload);
  @Select("SELECT DISTINCT ON(card_id) card_id,effective_month AS month,data::text AS payload,revision,updated_at FROM kb_benefit_plan WHERE effective_month<=#{month} ORDER BY card_id,effective_month DESC")
  List<Stored> plans(String month);
  @Select("SELECT card_id,effective_month AS month,data::text AS payload,revision,updated_at FROM kb_benefit_plan WHERE card_id=#{cardId} AND effective_month<=#{month} ORDER BY effective_month DESC LIMIT 1")
  Stored plan(@Param("cardId") Long cardId,@Param("month") String month);
  @Select("SELECT card_id,effective_month AS month,data::text AS payload,revision,updated_at FROM kb_benefit_plan WHERE card_id=#{cardId} AND effective_month=#{month}")
  Stored exactPlan(@Param("cardId") Long cardId,@Param("month") String month);
  @Insert("INSERT INTO kb_benefit_plan(card_id,effective_month,data) VALUES(#{cardId},#{month},CAST(#{payload} AS jsonb)) ON CONFLICT(card_id,effective_month) DO UPDATE SET data=excluded.data,revision=kb_benefit_plan.revision+1,updated_at=now()")
  void savePlan(@Param("cardId") Long cardId,@Param("month") String month,@Param("payload") String payload);
  @Select("SELECT card_id,month,data::text AS payload,1 AS revision,updated_at FROM kb_benefit_usage WHERE card_id=#{cardId} AND month=#{month}")
  Stored usage(@Param("cardId") Long cardId,@Param("month") String month);
  @Insert("INSERT INTO kb_benefit_usage(card_id,month,data) VALUES(#{cardId},#{month},CAST(#{payload} AS jsonb)) ON CONFLICT(card_id,month) DO UPDATE SET data=excluded.data,updated_at=now()")
  void saveUsage(@Param("cardId") Long cardId,@Param("month") String month,@Param("payload") String payload);
}
