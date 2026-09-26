package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.KbBenefit;
import com.family.asset.exception.BusinessException;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class KbBenefitServiceTest {
  final KbBenefitMapper mapper=mock(KbBenefitMapper.class);
  final OperationMapper operations=mock(OperationMapper.class);
  final ObjectMapper json=new ObjectMapper();
  final KbBenefitService service=new KbBenefitService(mapper,mock(CatalogService.class),operations,json);
  KbBenefit.Report report(boolean confirmed,long revision) {
    return new KbBenefit.Report(1L,"2026-09","2026-08",new BigDecimal("200000"),new BigDecimal("300000"),
      List.of(new KbBenefit.Item("외식","KRW",new BigDecimal("10000"),new BigDecimal("12000"),"조건"),
        new KbBenefit.Item("적립","POINT",null,new BigDecimal("987"),null)),List.of(),"",revision,confirmed);
  }
  KbBenefit.Stored stored(long revision) {return new KbBenefit.Stored(1L,"2026-09",json.writeValueAsString(report(true,0)),revision,OffsetDateTime.now());}
  @Test void calculatesRemainingWithoutMixingUnitsOrInventingUnknownLimits() {
    var view=service.view(stored(1));
    assertEquals(0,new BigDecimal("100000").compareTo(view.remainingSpend()));
    assertEquals(new BigDecimal("66.67"),view.progress());
    assertEquals(BigDecimal.ZERO,view.benefits().get(0).remaining());
    assertNull(view.benefits().get(1).remaining());
    assertNull(KbBenefitService.remaining(null,BigDecimal.ZERO));
    assertNull(KbBenefitService.remaining(BigDecimal.TEN,null));
    assertEquals("MANUAL",view.sourceMode());
  }
  @Test void rejectsUnconfirmedAndStaleRecordsBeforeWriting() {
    assertThrows(BusinessException.class,()->service.save(report(false,0)));
    verifyNoInteractions(mapper,operations);
    when(mapper.find(1L,"2026-09")).thenReturn(stored(2));
    assertThrows(BusinessException.class,()->service.save(report(true,1)));
    verify(mapper,never()).save(anyLong(),anyString(),anyString());
  }
  @Test void storesConfirmedRecordWithRevisionAndListsOnlyRequestedMonth() {
    when(mapper.find(1L,"2026-09")).thenReturn(null,stored(1));
    assertEquals(1,service.save(report(true,0)).revision());
    verify(mapper).save(eq(1L),eq("2026-09"),anyString());
    when(mapper.list("2026-10")).thenReturn(List.of());
    assertTrue(service.list("2026-10").isEmpty());
    verify(mapper).list("2026-10");
  }
}
