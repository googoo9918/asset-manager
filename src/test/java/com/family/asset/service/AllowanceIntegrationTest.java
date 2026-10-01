package com.family.asset.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.*;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
@EnabledIfEnvironmentVariable(named="ASSET_ALLOWANCE_DB_TEST",matches="true")
class AllowanceIntegrationTest {
 @SuppressWarnings("unchecked") <T>T transactional(T bean,DataSourceTransactionManager manager){var factory=new ProxyFactory(bean);factory.setProxyTargetClass(true);factory.addAdvice(new TransactionInterceptor(manager,new AnnotationTransactionAttributeSource()));return (T)factory.getProxy();}
 @Test void importAndAllowanceAreAtomicAndUniqueWithoutExtraBalanceEffects()throws Exception {
  var source=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55441/billing_test","backup_test","");var sql=new JdbcTemplate(source);
  sql.execute(Files.readString(Path.of("db/migrate_kb_card_import.sql")));sql.execute(Files.readString(Path.of("db/migrate_allowance.sql")));sql.execute(Files.readString(Path.of("db/migrate_allowance.sql")));
  var factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath:mapper/*.xml"));var config=new org.apache.ibatis.session.Configuration();config.setMapUnderscoreToCamelCase(true);config.addMapper(AllowanceMapper.class);config.addMapper(KbImportMapper.class);factory.setConfiguration(config);
  var session=new SqlSessionTemplate(factory.getObject());var manager=new DataSourceTransactionManager(source);var entries=session.getMapper(EntryMapper.class);var ops=session.getMapper(OperationMapper.class);var imports=session.getMapper(KbImportMapper.class);var records=session.getMapper(AllowanceMapper.class);
  long accountId=sql.queryForObject("INSERT INTO asset_account(account_name,account_number,status,asset_type,owner_code,institution_code,current_balance_krw) VALUES('allowance test','allowance-'||gen_random_uuid(),'ACTIVE','CASH','HUSBAND','KB',1000) RETURNING id",Long.class);
  var card=new Card();card.setCardName("allowance test");card.setOwnerCode(OwnerCode.HUSBAND);card.setCardType(CardType.CREDIT);card.setStatus(AssetStatus.ACTIVE);card.setAccountId(accountId);card.setPaymentDay(14);session.getMapper(CardMapper.class).insert(card);
  var cat=new Category();cat.setName("allowance-"+UUID.randomUUID());cat.setActive(true);cat.setTransactionType(TransactionType.EXPENSE);session.getMapper(CategoryMapper.class).insert(cat);
  var catalog=mock(CatalogService.class);when(catalog.card(card.getId())).thenReturn(card);when(catalog.categoryFor(cat.getId(),TransactionType.EXPENSE)).thenReturn(cat);when(catalog.categories()).thenReturn(List.of(cat));
  var ledger=transactional(new LedgerService(entries,ops,catalog),manager);var allowance=transactional(new AllowanceService(records,entries,ops),manager);var importer=transactional(new KbImportService(catalog,ledger,ops,imports,allowance),manager);
  var row=new KbImport.Row(LocalDate.of(2026,10,1),"allowance success",new BigDecimal("1000"),"APPROVED",1,UUID.randomUUID().toString());
  var preview=importer.preview(new KbImport.Preview(card.getId(),List.of(row)));
  var request=new KbImport.Commit(preview.previewId(),null,List.of(0),false,List.of(new KbImport.Selection(0,cat.getId(),false,"HUSBAND")),true);importer.commit(request);
  long entryId=imports.find(card.getId(),KbImportService.key(row));assertEquals("HUSBAND",records.source(entryId).getOwnerCode());assertEquals(new BigDecimal("-1000.00"),records.source(entryId).getAmount());
  assertThrows(RuntimeException.class,()->importer.commit(request));assertEquals(1,sql.queryForObject("SELECT count(*) FROM allowance_record WHERE source_entry_id=?",Integer.class,entryId));
  allowance.assign(entryId,"WIFE");assertEquals("WIFE",records.source(entryId).getOwnerCode());allowance.assign(entryId,null);assertFalse(records.source(entryId).getActive());allowance.assign(entryId,"HUSBAND");
  var bad=new KbImport.Row(LocalDate.of(2026,10,2),"allowance failure",new BigDecimal("2000"),"APPROVED",1,UUID.randomUUID().toString());var badPreview=importer.preview(new KbImport.Preview(card.getId(),List.of(bad)));
  sql.execute("ALTER TABLE allowance_record ADD CONSTRAINT allowance_test_reject_wife CHECK(owner_code <> 'WIFE') NOT VALID");
  try{assertThrows(RuntimeException.class,()->importer.commit(new KbImport.Commit(badPreview.previewId(),null,List.of(0),false,List.of(new KbImport.Selection(0,cat.getId(),false,"WIFE")),true)));}
  finally{sql.execute("ALTER TABLE allowance_record DROP CONSTRAINT allowance_test_reject_wife");}
  assertNull(imports.find(card.getId(),KbImportService.key(bad)));assertEquals(1,sql.queryForObject("SELECT count(*) FROM ledger_entry WHERE card_id=?",Integer.class,card.getId()));
  assertEquals(new BigDecimal("1000.00"),sql.queryForObject("SELECT current_balance_krw FROM asset_account WHERE id=?",BigDecimal.class,accountId));assertTrue(ops.effects(entryId).isEmpty());
  var manual=new AllowanceRecord();manual.setOwnerCode("WIFE");manual.setRecordDate(LocalDate.of(2026,10,1));manual.setAmount(new BigDecimal("800000"));manual.setMemo("allowance");manual.setRequestId(UUID.randomUUID().toString());var first=allowance.manual(null,manual);assertEquals(first.getId(),allowance.manual(null,manual).getId());
  ledger.cancel(entryId);var item=allowance.list(YearMonth.of(2026,10),"HUSBAND").items().stream().filter(i->Objects.equals(i.sourceEntryId(),entryId)).findFirst().orElseThrow();assertTrue(item.sourceCancelled());assertEquals(0,item.amount().signum());
 }
}
