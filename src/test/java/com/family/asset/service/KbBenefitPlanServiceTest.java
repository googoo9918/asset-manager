package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.KbBenefitPlan.*;
import com.family.asset.mapper.*;
import com.family.asset.exception.BusinessException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class KbBenefitPlanServiceTest {
  final KbBenefitPlanMapper mapper=mock(KbBenefitPlanMapper.class);
  final KbBrowserService browser=mock(KbBrowserService.class);
  final ObjectMapper json=new ObjectMapper();
  final KbBenefitPlanService service=new KbBenefitPlanService(mapper,mock(CatalogService.class),mock(OperationMapper.class),browser,json);
  BigDecimal n(String n){return new BigDecimal(n);}
  Benefit benefit(String limit){return new Benefit("외식",List.of("스타B_음식점할인"),"KRW",n(limit));}
  Plan plan(){return new Plan(1L,"KB Star B카드","2026-09",List.of(new Tier("1구간",n("400000"),List.of(benefit("10000"))),new Tier("2구간",n("800000"),List.of(benefit("20000")))),0);}
  Stored stored(Object value){return new Stored(1L,"2026-09",json.writeValueAsString(value),1,OffsetDateTime.now());}
  Usage usage(boolean complete){return new Usage("2026-09","KB Star B카드",n("78900"),n("400000"),List.of(new Received("26.09.10","스타B_음식점할인","KRW",n("3000")),new Received("26.09.11","스타B_음식점할인","KRW",n("2000")),new Received("26.09.11","다른카드_음식점할인","KRW",n("9999")),new Received("26.09.12","스타B_음식점할인","POINT",n("9999"))),complete,List.of(),List.of());}
  @Test void usesPreviousMonthForBenefitsAndCurrentMonthForNextTierWithExactMatching(){
    var v=service.view(stored(plan()),stored(usage(true)),"2026-09");
    assertEquals("1구간",v.appliedTier().name());assertNull(v.earnedTier());
    assertEquals("1구간",v.nextTier().name());assertEquals(n("321100"),v.remainingSpend());
    assertEquals(n("5000"),v.benefits().getFirst().used());assertEquals(n("5000"),v.benefits().getFirst().remaining());
    assertEquals(n("50.00"),v.benefits().getFirst().progress());
    assertEquals("2구간",KbBenefitPlanService.tier(plan().tiers(),n("800000")).name());
  }
  @Test void incompleteUsageNeverClaimsAnExactRemainingLimitAndUnqueriedIsNotZero(){
    var v=service.view(stored(plan()),stored(usage(false)),"2026-09");
    assertNull(v.benefits().getFirst().remaining());assertNull(v.benefits().getFirst().progress());
    var blank=service.view(stored(plan()),null,"2026-09");
    assertNull(blank.usage());assertNull(blank.appliedTier());assertTrue(blank.benefits().isEmpty());
  }
  @Test void rejectsAmbiguousMappingsAndStaleConfiguration(){
    var p=plan();var ambiguous=new Plan(1L,p.sourceCard(),p.effectiveMonth(),List.of(new Tier("1구간",n("400000"),List.of(benefit("10000"),new Benefit("다른 혜택",List.of("스타B_음식점할인"),"KRW",n("20000"))))),0);
    assertThrows(BusinessException.class,()->service.save(ambiguous));verify(mapper,never()).savePlan(anyLong(),anyString(),anyString());
    when(mapper.exactPlan(1L,"2026-09")).thenReturn(stored(plan()));
    assertThrows(BusinessException.class,()->service.save(plan()));
  }
  @Test void syncReplacesMonthlyTotalsAndRejectsAnotherJobsToken(){
    var usage=usage(true);
    var result=java.util.Map.of("state","done","result",java.util.Map.of("tracking",java.util.Map.of("cardId",1,"month","2026-09","token","test"),"usage",usage));
    when(browser.call(anyMap())).thenReturn(result);when(mapper.plan(1L,"2026-09")).thenReturn(stored(plan()));when(mapper.usage(1L,"2026-09")).thenReturn(stored(usage));
    assertThrows(BusinessException.class,()->service.apply("different"));
    verify(mapper,never()).saveUsage(anyLong(),anyString(),anyString());
    var first=service.apply("test");var second=service.apply("test");
    assertEquals(first.benefits(),second.benefits());
    verify(mapper,times(2)).saveUsage(1L,"2026-09",json.writeValueAsString(usage));
    when(mapper.tierChoice(1L,"2026-09")).thenReturn(stored(new TierChoice(plan().sourceCard(),"2구간")));
    var manual=service.apply("test");assertEquals("MANUAL",manual.tierMode());assertEquals("2구간",manual.appliedTier().name());
    assertEquals(n("15000"),manual.benefits().getFirst().remaining());
    verify(mapper,never()).saveTierChoice(anyLong(),anyString(),anyString());
  }
  @Test void manualTierWorksWithZeroPreviousSpendAndDoesNotCarryToNextMonth(){
    var u=usage(true);
    var firstMonth=new Usage(u.month(),u.sourceCard(),u.currentSpend(),BigDecimal.ZERO,u.received(),true,List.of(),List.of());
    when(mapper.tierChoice(1L,"2026-09")).thenReturn(stored(new TierChoice(plan().sourceCard(),"1구간")));
    var v=service.view(stored(plan()),stored(firstMonth),"2026-09");
    assertEquals("MANUAL",v.tierMode());assertEquals(n("5000"),v.benefits().getFirst().remaining());
    assertNull(v.earnedTier());assertEquals(n("321100"),v.remainingSpend());assertEquals(BigDecimal.ZERO,v.usage().previousSpend());
    var next=service.view(stored(plan()),null,"2026-10");assertEquals("AUTO",next.tierMode());assertNull(next.appliedTier());
    var blank=service.view(stored(plan()),null,"2026-09");assertNull(blank.benefits().getFirst().used());assertNull(blank.benefits().getFirst().remaining());
  }
  @Test void invalidManualTierNeedsReviewAndAutomaticResetUsesActualSpend(){
    when(mapper.tierChoice(1L,"2026-09")).thenReturn(stored(new TierChoice(plan().sourceCard(),"삭제된 구간")));
    var v=service.view(stored(plan()),stored(usage(true)),"2026-09");assertEquals("REVIEW",v.tierMode());assertNull(v.appliedTier());
    when(mapper.tierChoice(1L,"2026-09")).thenReturn(stored(new TierChoice(plan().sourceCard(),null)));
    v=service.view(stored(plan()),stored(usage(true)),"2026-09");assertEquals("AUTO",v.tierMode());assertEquals("1구간",v.appliedTier().name());
  }
  @Test void savesOnlyValidMonthlyChoicesAndRejectsStaleChanges(){
    when(mapper.plan(1L,"2026-09")).thenReturn(stored(plan()));
    assertThrows(BusinessException.class,()->service.setTier(new SetTier(1L,"2026-09","없는 구간","2026-09",1,0)));
    assertThrows(BusinessException.class,()->service.setTier(new SetTier(1L,"2026-09","1구간","2026-09",2,0)));
    when(mapper.tierChoice(1L,"2026-09")).thenReturn(stored(new TierChoice(plan().sourceCard(),"1구간")));
    assertThrows(BusinessException.class,()->service.setTier(new SetTier(1L,"2026-09","2구간","2026-09",1,0)));
    verify(mapper,never()).saveTierChoice(anyLong(),anyString(),anyString());
    service.setTier(new SetTier(1L,"2026-09","2구간","2026-09",1,1));
    verify(mapper).saveTierChoice(1L,"2026-09",json.writeValueAsString(new TierChoice(plan().sourceCard(),"2구간")));
    service.setTier(new SetTier(1L,"2026-09",null,"2026-09",1,1));
    verify(mapper).saveTierChoice(1L,"2026-09",json.writeValueAsString(new TierChoice(plan().sourceCard(),null)));
  }
}
