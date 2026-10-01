package com.family.asset.service;
import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
@EnabledIfEnvironmentVariable(named="ASSET_REVIEW_DB_TEST",matches="true")
class ReviewIntegrationTest {
 @Test void categoryOnlyMapperChangePreservesOriginalEntryBalanceAndAudit()throws Exception {
  var source=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55441/billing_test","backup_test","");
  try(var c=source.getConnection();var s=c.createStatement()) {
   s.execute(Files.readString(Path.of("db/migrate_review.sql")));s.execute(Files.readString(Path.of("db/migrate_review.sql")));
  }
  var factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setTransactionFactory(new org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory());factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath:mapper/*.xml"));var configuration=new org.apache.ibatis.session.Configuration();configuration.setMapUnderscoreToCamelCase(true);factory.setConfiguration(configuration);
  try(var session=factory.getObject().openSession(false)) {
   var entries=session.getMapper(EntryMapper.class);var categories=session.getMapper(CategoryMapper.class);var ops=session.getMapper(OperationMapper.class);
   long accountId;
   try(var s=session.getConnection().createStatement();var r=s.executeQuery("INSERT INTO asset_account(account_name,account_number,status,asset_type,owner_code,institution_code,current_balance_krw) VALUES('review test','review-'||gen_random_uuid(),'ACTIVE','CASH','HUSBAND','KB',1000) RETURNING id")){r.next();accountId=r.getLong(1);}
   var category=new Category();category.setName("review-"+java.util.UUID.randomUUID());category.setActive(true);category.setTransactionType(TransactionType.EXPENSE);categories.insert(category);
   var e=new Entry();e.setTransactionDate(LocalDate.of(2026,9,30));e.setTransactionType(TransactionType.EXPENSE);e.setPaymentMethod(PaymentMethod.DEBIT);e.setSourceAccountId(accountId);e.setAmount(new BigDecimal("100"));e.setAttribution(Attribution.HUSBAND);e.setInstallmentMonths(1);e.setOrigin("MANUAL");e.setVoided(false);entries.insert(e);
   var service=new ReviewService(entries,categories,session.getMapper(CardMapper.class),session.getMapper(AccountMapper.class),session.getMapper(InstallmentMapper.class),session.getMapper(InstallmentScheduleMapper.class),ops);
   service.classify(e.getId(),category.getId(),null);
   var updated=entries.findById(e.getId());assertEquals(category.getId(),updated.getCategoryId());assertEquals(0,new BigDecimal("100").compareTo(updated.getAmount()));assertEquals(accountId,updated.getSourceAccountId());assertFalse(updated.getVoided());assertNull(updated.getReplacesId());assertEquals("MANUAL",updated.getOrigin());
   try(var s=session.getConnection().createStatement();var r=s.executeQuery("SELECT current_balance_krw FROM asset_account WHERE id="+accountId)){r.next();assertEquals(new BigDecimal("1000.00"),r.getBigDecimal(1));}
   try(var s=session.getConnection().createStatement();var r=s.executeQuery("SELECT old_category_id,new_category_id FROM entry_category_change WHERE entry_id="+e.getId())){assertTrue(r.next());assertNull(r.getObject(1));assertEquals(category.getId(),r.getLong(2));assertFalse(r.next());}
   assertTrue(ops.effects(e.getId()).isEmpty());
   service.classify(e.getId(),category.getId(),null);
   try(var s=session.getConnection().createStatement();var r=s.executeQuery("SELECT count(*) FROM entry_category_change WHERE entry_id="+e.getId())){r.next();assertEquals(1,r.getInt(1));}
   session.rollback();assertNull(entries.findById(e.getId()));
  }
 }
}
