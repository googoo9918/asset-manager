package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.exception.BusinessException;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class KbImportServiceTest {
  final CatalogService catalog=mock(CatalogService.class);
  final LedgerService ledger=mock(LedgerService.class);
  final OperationMapper ops=mock(OperationMapper.class);
  final KbImportMapper imports=mock(KbImportMapper.class);
  final KbImportService service=new KbImportService(catalog,ledger,ops,imports);
  final Card card=new Card();
  @BeforeEach void setup() {
    card.setId(1L);card.setStatus(AssetStatus.ACTIVE);card.setCardType(CardType.CREDIT);card.setOwnerCode(OwnerCode.HUSBAND);
    when(catalog.card(1L)).thenReturn(card);when(ledger.list()).thenReturn(List.of());when(imports.ready()).thenReturn(true);
    when(imports.find(anyLong(),anyString())).thenReturn(null);
    when(ledger.create(any(),eq("MANUAL"),anyBoolean())).thenAnswer(call->{Entry e=call.getArgument(0);e.setId(42L);return e;});
  }
  KbImport.Row row(String status,String approval,String amount,int months) {
    return new KbImport.Row(LocalDate.of(2026,9,15),"카페",new BigDecimal(amount),status,months,approval);
  }
  @Test void previewNeverWritesAndSeparatesCancellationUnknownAndDuplicates() {
    var a=row("APPROVED","0001","1000",1);
    var preview=service.preview(new KbImport.Preview(1L,List.of(a,a,row("CANCELLED","0002","1000",1),row("UNKNOWN",null,"1000",1))));
    assertEquals(List.of("READY","DUPLICATE","REVIEW","REVIEW"),preview.rows().stream().map(KbImport.Checked::status).toList());
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  @Test void sameDayAmountManualEntryRequiresReview() {
    var e=new Entry();e.setCardId(1L);e.setTransactionType(TransactionType.EXPENSE);e.setTransactionDate(LocalDate.of(2026,9,15));e.setAmount(new BigDecimal("1000"));
    when(ledger.list()).thenReturn(List.of(e));
    assertEquals("REVIEW",service.preview(new KbImport.Preview(1L,List.of(row("APPROVED",null,"1000",1)))).rows().getFirst().status());
  }
  @Test void approvalWithMatchingCancellationIsNeverImportedAsANewExpense() {
    var result=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1234","5000",1),row("CANCELLED","1234","-5000",1))));
    assertEquals(List.of("REVIEW","REVIEW"),result.rows().stream().map(KbImport.Checked::status).toList());
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(result.previewId(),1L,List.of(0),false)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  @Test void rechecksPersistentIdentityBeforeWritingAndKeepsVoidedSourceBlocked() {
    var a=row("APPROVED","0001","1000",1);
    var draft=service.preview(new KbImport.Preview(1L,List.of(a)));
    when(imports.find(1L,KbImportService.key(a))).thenReturn(42L);
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0),false)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  @Test void checksAllRowsBeforeWritingAndRejectsDuplicateSelection() {
    var draft=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1","1000",1),row("CANCELLED","2","1000",1))));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0,1),false)));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0,0),false)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  @Test void importsFullInstallmentAmountAndSavesIdentityUnderLock() {
    var row=row("APPROVED","1","120000",3);
    var draft=service.preview(new KbImport.Preview(1L,List.of(row)));
    assertEquals(1,service.commit(new KbImport.Commit(draft.previewId(),5L,List.of(0),false)).get("imported"));
    var order=inOrder(ops,ledger,imports);
    order.verify(ops).lock();
    order.verify(ledger).create(argThat(e->e.getAmount().compareTo(new BigDecimal("120000"))==0
        &&e.getInstallmentMonths()==3&&e.getPaymentMethod()==PaymentMethod.CREDIT&&e.getCategoryId()==5L
        &&e.getCardId()==1L&&e.getAttribution()==Attribution.HUSBAND&&e.getTransactionType()==TransactionType.EXPENSE
        &&e.getTransactionDate().equals(row.date())&&e.getMemo().contains(row.merchant())),eq("MANUAL"),eq(false));
    order.verify(imports).insert(1L,KbImportService.key(row),42L);
  }
  @Test void debitBalanceModeIsExplicitAndInstallmentsRejected() {
    card.setCardType(CardType.DEBIT);
    var draft=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1","1000",1))));
    service.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0),true));
    verify(ledger).create(any(),eq("MANUAL"),eq(true));
    var installment=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","2","1000",3))));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(installment.previewId(),1L,List.of(0),false)));
  }
  @Test void missingMigrationAllowsPreviewButBlocksCommit() {
    when(imports.ready()).thenReturn(false);
    var draft=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1","1000",1))));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0),false)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  @Test void savesCardMappingWithoutRegisteringTransactionsAndReusesIt() {
    card.setAccountId(6L);
    var account=new Account();account.setId(6L);account.setAssetType(AssetType.CASH);
    when(catalog.activeAccount(6L)).thenReturn(account);
    var mapping=new KbImport.Mapping("KB 이용카드",1L,6L,false);
    assertEquals(mapping,service.saveMapping(mapping));
    verify(imports).saveMapping(mapping);
    when(imports.mapping(mapping.sourceCard())).thenReturn(mapping);
    var preview=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1","1000",1)),mapping.sourceCard()));
    assertEquals("READY",preview.rows().getFirst().status());
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
    verify(ops,never()).changeBalance(anyLong(),any());
  }
  @Test void confirmationAndPerRowCategoriesAreValidatedBeforeAnyWrite() {
    var draft=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1","1000",1),row("APPROVED","2","2000",1))));
    var selections=List.of(new KbImport.Selection(0,5L,true),new KbImport.Selection(1,6L,false));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),null,List.of(0,1),false,selections,false)));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),null,List.of(0,1),false,List.of(selections.getFirst()),true)));
    doThrow(new BusinessException("비활성 분류")).when(catalog).categoryFor(6L,TransactionType.EXPENSE);
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),null,List.of(0,1),false,selections,true)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
    verify(imports,never()).saveCategoryRule(anyString(),anyString(),anyLong());
  }
  @Test void savesRowCategoriesAndOnlyExplicitlyRememberedRulesAfterConfirmation() {
    var a=new KbImport.Row(LocalDate.of(2026,9,16),"아워홈",new BigDecimal("1000"),"APPROVED",1,"1",false,"일반음식점 기타");
    var b=new KbImport.Row(a.date(),a.merchant(),new BigDecimal("2000"),"APPROVED",1,"2",false,"커피/음료전문점");
    var draft=service.preview(new KbImport.Preview(1L,List.of(a,b)));
    var selections=List.of(new KbImport.Selection(0,5L,true),new KbImport.Selection(1,6L,false));
    service.commit(new KbImport.Commit(draft.previewId(),null,List.of(0,1),false,selections,true));
    verify(ledger).create(argThat(e->e.getAmount().intValue()==1000&&e.getCategoryId()==5L),eq("MANUAL"),eq(false));
    verify(ledger).create(argThat(e->e.getAmount().intValue()==2000&&e.getCategoryId()==6L),eq("MANUAL"),eq(false));
    verify(imports).saveCategoryRule("아워홈","일반음식점 기타",5L);
    verify(imports,never()).saveCategoryRule(eq("아워홈"),eq("커피/음료전문점"),anyLong());
  }
  @Test void conflictingRulesInOneCommitAreRejectedBeforeWrites() {
    var draft=service.preview(new KbImport.Preview(1L,List.of(row("APPROVED","1","1000",1),row("APPROVED","2","2000",1))));
    var selections=List.of(new KbImport.Selection(0,5L,true),new KbImport.Selection(1,6L,true));
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),null,List.of(0,1),false,selections,true)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  KbImport.Row pointRow() {
    return new KbImport.Row(LocalDate.of(2026,9,15),"포인트 사용",new BigDecimal("1000"),"APPROVED",1,"point-1",true);
  }
  KbImport.Mapping pointMapping() {
    card.setCardType(CardType.DEBIT);card.setAccountId(6L);
    var account=new Account();account.setId(6L);account.setAssetType(AssetType.CASH);
    when(catalog.activeAccount(6L)).thenReturn(account);
    var mapping=new KbImport.Mapping("K015",1L,6L,true);
    when(imports.mapping("K015")).thenReturn(mapping);
    return mapping;
  }
  @Test void pointPaymentRequiresSavedDebitMappingAndRechecksAccountBeforeCommit() {
    assertEquals("REVIEW",service.preview(new KbImport.Preview(1L,List.of(pointRow()))).rows().getFirst().status());
    pointMapping();
    var draft=service.preview(new KbImport.Preview(1L,List.of(pointRow()),"K015"));
    assertEquals("READY",draft.rows().getFirst().status());
    card.setAccountId(9L);
    assertThrows(BusinessException.class,()->service.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0),true)));
    verify(ledger,never()).create(any(),anyString(),anyBoolean());
  }
  @Test void pointImportDebitsConnectedAssetOnceAndManualCancellationRestoresIt() {
    pointMapping();
    var entries=mock(EntryMapper.class);
    var stored=new HashMap<Long,Entry>();
    when(entries.insert(any())).thenAnswer(call->{Entry e=call.getArgument(0);e.setId(42L);stored.put(42L,e);return 1;});
    when(entries.findById(42L)).thenAnswer(call->stored.get(42L));
    when(entries.findAll()).thenAnswer(call->new ArrayList<>(stored.values()));
    var keys=new HashMap<String,Long>();
    when(imports.find(eq(1L),anyString())).thenAnswer(call->keys.get(call.getArgument(1)));
    doAnswer(call->{keys.put(call.getArgument(1),call.getArgument(2));return null;}).when(imports).insert(anyLong(),anyString(),anyLong());
    var realLedger=new LedgerService(entries,ops,catalog);
    var importer=new KbImportService(catalog,realLedger,ops,imports);
    var request=new KbImport.Preview(1L,List.of(pointRow()),"K015");
    var draft=importer.preview(request);
    // Point mappings always debit their asset, even if an old client sends affectBalance=false.
    importer.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0),false));
    assertEquals(1L,stored.get(42L).getCardId());assertEquals(6L,stored.get(42L).getSourceAccountId());
    assertTrue(stored.get(42L).getMemo().contains("포인트리"));
    assertEquals("DUPLICATE",importer.preview(request).rows().getFirst().status());
    assertThrows(BusinessException.class,()->importer.commit(new KbImport.Commit(draft.previewId(),1L,List.of(0),true)));
    verify(ops,times(1)).changeBalance(6L,new BigDecimal("-1000"));
    when(ops.effects(42L)).thenReturn(List.of(Map.of("account_id",6L,"delta",new BigDecimal("-1000"))));
    realLedger.cancel(42L);
    verify(ops).changeBalance(6L,new BigDecimal("1000"));
    assertEquals("DUPLICATE",importer.preview(request).rows().getFirst().status());
  }
}
