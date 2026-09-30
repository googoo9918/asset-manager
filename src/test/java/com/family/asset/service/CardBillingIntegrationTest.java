package com.family.asset.service;
import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
@EnabledIfEnvironmentVariable(named="ASSET_CARD_BILLING_DB_TEST",matches="true")
class CardBillingIntegrationTest {
 @Test void additiveMigrationAndMapperRoundTrip()throws Exception {
  var source=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55441/billing_test","backup_test","");
  long accountId;
  try(var c=source.getConnection();var s=c.createStatement()) {
   boolean exists;try(var r=s.executeQuery("SELECT to_regclass('public.payment_card')")){r.next();exists=r.getString(1)!=null;}
   if(!exists){var schema=Files.readString(Path.of("db/schema.sql"));schema=schema.replace(" billing_closing_day integer CHECK(billing_closing_day BETWEEN 1 AND 31),","").replace(" billing_month_offset integer CHECK(billing_month_offset BETWEEN 0 AND 2),","").replace(" source_entry_id bigint UNIQUE REFERENCES ledger_entry(id),","");s.execute(schema);}
   s.execute(Files.readString(Path.of("db/migrate_card_billing.sql")));s.execute(Files.readString(Path.of("db/migrate_card_billing.sql")));
   try(var r=s.executeQuery("INSERT INTO asset_account(account_name,account_number,status,asset_type,owner_code,institution_code,current_balance_krw) VALUES('billing test','billing-'||gen_random_uuid(),'ACTIVE','CASH','HUSBAND','KB',1000) RETURNING id")){r.next();accountId=r.getLong(1);}
  }
  var factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath:mapper/*.xml"));var configuration=new org.apache.ibatis.session.Configuration();configuration.setMapUnderscoreToCamelCase(true);factory.setConfiguration(configuration);
  try(var session=factory.getObject().openSession(true)) {
   var cards=session.getMapper(CardMapper.class);var entries=session.getMapper(EntryMapper.class);var installments=session.getMapper(InstallmentMapper.class);var schedules=session.getMapper(InstallmentScheduleMapper.class);
   var card=new Card();card.setCardName("billing test");card.setOwnerCode(OwnerCode.HUSBAND);card.setAccountId(accountId);card.setCardType(CardType.CREDIT);card.setStatus(AssetStatus.ACTIVE);card.setPaymentDay(14);card.setBillingClosingDay(31);card.setBillingMonthOffset(1);cards.insert(card);
   assertEquals(31,cards.findById(card.getId()).getBillingClosingDay());card.setBillingClosingDay(15);cards.update(card);assertEquals(15,cards.findById(card.getId()).getBillingClosingDay());
   var e=new Entry();e.setTransactionDate(LocalDate.of(2026,9,1));e.setTransactionType(TransactionType.EXPENSE);e.setPaymentMethod(PaymentMethod.CREDIT);e.setCardId(card.getId());e.setAmount(new BigDecimal("100"));e.setAttribution(Attribution.HUSBAND);e.setInstallmentMonths(3);e.setOrigin("MANUAL");e.setVoided(false);entries.insert(e);
   var old=new Installment();old.setCardId(card.getId());old.setRemainingAmount(new BigDecimal("100"));old.setRemainingMonths(3);old.setFirstPaymentDate(LocalDate.of(2026,10,14));old.setActive(true);installments.insert(old);installments.linkSource(old.getId(),e.getId());assertEquals(e.getId(),installments.findById(old.getId()).getSourceEntryId());
   var row=new InstallmentSchedule();row.setInstallmentId(old.getId());row.setDueDate(LocalDate.of(2026,10,14));row.setAmount(new BigDecimal("33.33"));row.setState("PENDING");schedules.insert(row);
   var billing=new CardBillingService(cards,entries,installments,schedules,session.getMapper(OccurrenceMapper.class),session.getMapper(OperationMapper.class));
   var statement=billing.month(YearMonth.of(2026,10),"JOINT").cards().stream().filter(x->x.cardId().equals(card.getId())).findFirst().orElseThrow();assertEquals(1,statement.lines().size());assertEquals(new BigDecimal("33.33"),statement.expected());
   old.setRemainingAmount(new BigDecimal("66.67"));installments.update(old);assertEquals(e.getId(),installments.findById(old.getId()).getSourceEntryId());
   try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT current_balance_krw FROM asset_account WHERE id="+accountId)){r.next();assertEquals(new BigDecimal("1000.00"),r.getBigDecimal(1));}
  }
 }
}
