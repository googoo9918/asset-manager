package com.family.asset.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import com.family.asset.exception.BusinessException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
class AllowanceServiceTest {
 final AllowanceMapper records=mock(AllowanceMapper.class);final EntryMapper entries=mock(EntryMapper.class);final OperationMapper ops=mock(OperationMapper.class);
 final AllowanceService service=new AllowanceService(records,entries,ops);
 AllowanceRecord record(long id,String owner,String date,String amount,Long source){var r=new AllowanceRecord();r.setId(id);r.setOwnerCode(owner);r.setRecordDate(LocalDate.parse(date));r.setAmount(new BigDecimal(amount));r.setSourceEntryId(source);r.setMemo("test");r.setActive(true);r.setRequestId(UUID.randomUUID().toString());return r;}
 Entry entry(long id,Long replaces,String date,String amount,boolean voided){var e=new Entry();e.setId(id);e.setReplacesId(replaces);e.setTransactionDate(LocalDate.parse(date));e.setAmount(new BigDecimal(amount));e.setVoided(voided);e.setTransactionType(TransactionType.EXPENSE);e.setMemo("receipt");return e;}
 @BeforeEach void setup(){when(entries.findAll()).thenReturn(List.of());when(records.all()).thenReturn(List.of());}
 @Test void monthTotalsCarryOpeningAndKeepOwnersSeparate(){when(records.all()).thenReturn(List.of(record(1,"HUSBAND","2026-09-01","800000",null),record(2,"HUSBAND","2026-10-01","-10000",null),record(3,"WIFE","2026-10-01","20000",null),record(4,"HUSBAND","2026-11-01","90000",null)));var result=service.list(YearMonth.of(2026,10),"HUSBAND");assertEquals(1,result.items().size());var total=result.summaries().getFirst();assertEquals(0,new BigDecimal("790000").compareTo(total.balance()));assertEquals(0,new BigDecimal("10000").compareTo(total.used()));verifyNoInteractions(ops);}
 @Test void followsReplacementAndExcludesCancelledSource(){var root=entry(1,null,"2026-09-30","100",true);var latest=entry(2,1L,"2026-10-01","150",false);when(entries.findAll()).thenReturn(List.of(root,latest));when(records.all()).thenReturn(List.of(record(1,"WIFE","2026-09-30","-100",1L)));var result=service.list(YearMonth.of(2026,10),"WIFE");assertEquals(new BigDecimal("-150"),result.items().getFirst().amount());assertEquals(2L,result.items().getFirst().currentEntryId());latest.setVoided(true);result=service.list(YearMonth.of(2026,10),"WIFE");assertTrue(result.items().getFirst().sourceCancelled());assertEquals(0,result.summaries().getFirst().used().signum());}
 @Test void retryUsesSameManualRecordAndNeverChangesAccountBalance(){var row=record(1,"HUSBAND","2026-10-01","800000",null);when(records.request(row.getRequestId())).thenReturn(row);assertSame(row,service.manual(null,row));verify(records,never()).insert(any());verify(ops,never()).changeBalance(any(),any());}
 @Test void invalidOwnerAndAmountAndTokenAreRejected(){var row=record(1,"JOINT","2026-10-01","10",null);assertThrows(BusinessException.class,()->service.manual(null,row));row.setOwnerCode("WIFE");row.setAmount(BigDecimal.ZERO);assertThrows(BusinessException.class,()->service.manual(null,row));row.setAmount(BigDecimal.ONE);row.setRequestId("bad");assertThrows(BusinessException.class,()->service.manual(null,row));verify(records,never()).insert(any());}
 @Test void assigningRequiresImportedLiveExpenseAndUnlinkDoesNotCancelOriginal(){var source=entry(1,null,"2026-10-01","100",false);when(entries.findAll()).thenReturn(List.of(source));when(entries.findById(1L)).thenReturn(source);assertThrows(BusinessException.class,()->service.assign(1L,"WIFE"));when(records.imported(1L)).thenReturn(true);service.assign(1L,"WIFE");verify(records).link(argThat(r->r.getOwnerCode().equals("WIFE")&&r.getSourceEntryId()==1L&&r.getAmount().compareTo(new BigDecimal("-100"))==0));var old=record(8,"WIFE","2026-10-01","-100",1L);when(records.source(1L)).thenReturn(old);service.assign(1L,null);verify(records).remove(8L);source.setVoided(true);assertThrows(BusinessException.class,()->service.assign(1L,"HUSBAND"));verify(entries,never()).update(any());verify(ops,never()).changeBalance(any(),any());}
}
