package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.*;
import com.family.asset.exception.BusinessException;
import java.math.BigDecimal;
import java.time.*;
import java.nio.file.*;
import java.sql.DriverManager;
import javax.sql.DataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.*;

/** Explicitly enabled, disposable DB only; does not read application.yml. */
@EnabledIfEnvironmentVariable(named="ASSET_INSTALLMENT_DB_TEST", matches="true")
@SpringJUnitConfig(InstallmentFlowIntegrationTest.Config.class)
@Transactional
class InstallmentFlowIntegrationTest {
  static final String URL="jdbc:postgresql://127.0.0.1:55439/installment_test";
  @Configuration
  @EnableTransactionManagement
  @MapperScan("com.family.asset.mapper")
  @Import({CatalogService.class,InstallmentService.class,PlanService.class,LoanService.class,LedgerService.class})
  static class Config {
    @Bean DataSource dataSource() { return new DriverManagerDataSource(URL,"installment_test",""); }
    @Bean JdbcTemplate jdbc(DataSource d) { return new JdbcTemplate(d); }
    @Bean DataSourceTransactionManager transactionManager(DataSource d) { return new DataSourceTransactionManager(d); }
    @Bean SqlSessionFactory sqlSessionFactory(DataSource d) throws Exception {
      var f=new SqlSessionFactoryBean(); f.setDataSource(d);
      f.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath:mapper/*.xml"));
      var c=new org.apache.ibatis.session.Configuration(); c.setMapUnderscoreToCamelCase(true); f.setConfiguration(c);
      return f.getObject();
    }
  }
  @BeforeAll static void schema() throws Exception {
    try(var c=DriverManager.getConnection(URL,"installment_test","");var s=c.createStatement()) {
      try(var r=s.executeQuery("SELECT to_regclass('public.asset_account')")) {
        r.next(); if(r.getString(1)!=null) return;
      }
      s.execute(Files.readString(Path.of("db/schema.sql")));
    }
  }
  @Autowired JdbcTemplate db;
  @Autowired CatalogService catalog;
  @Autowired PlanService plans;
  @Autowired InstallmentService installments;
  long accountId, cardId;
  final YearMonth start=YearMonth.of(2030,1);
  @BeforeEach void setup() {
    accountId=db.queryForObject("INSERT INTO asset_account(account_name,account_number,status,asset_type,owner_code,institution_code,current_balance_krw) VALUES('test','test','ACTIVE','CASH','HUSBAND','KB',1000000) RETURNING id",Long.class);
    cardId=db.queryForObject("INSERT INTO payment_card(card_name,status,card_type,owner_code,account_id,payment_day,created_at) VALUES('test','ACTIVE','CREDIT','HUSBAND',?,31,'2020-01-01') RETURNING id",Long.class,accountId);
  }
  Installment add(String amount,int months) {
    var x=new Installment(); x.setCardId(cardId); x.setRemainingAmount(new BigDecimal(amount));
    x.setRemainingMonths(months); x.setFirstPaymentDate(start.atEndOfMonth()); x.setActive(true); x.setMemo("test installment");
    return catalog.saveInstallment(null,x);
  }
  Occurrence occurrence(YearMonth month) { return plans.month(month).stream().filter(o->o.getCardId()!=null && o.getCardId()==cardId && YearMonth.from(o.getDueDate()).equals(month)).findFirst().orElseThrow(); }
  Installment read(Long id) { return catalog.installments().stream().filter(x->x.getId().equals(id)).findFirst().orElseThrow(); }
  void pay(Occurrence o,String amount,LocalDate date) { plans.confirm(o.getId(),new Commands.Confirm(date,new BigDecimal(amount),null,null)); }
  void money(String expected,BigDecimal actual) { assertEquals(0,new BigDecimal(expected).compareTo(actual)); }

  @Test void registersRepeatsSettlesMultipleInstallmentsAndCompletesWithoutNewExpense() {
    var a=add("300000",3); var b=add("60000",2);
    var jan=occurrence(start); money("130000",jan.getAmount());
    assertEquals(5,installments.list().size());
    plans.generate(start); assertEquals(1,plans.month(start).size());
    pay(jan,"150000",LocalDate.of(2030,2,2));
    money("850000",catalog.account(accountId).getCurrentBalanceKrw());
    money("200000",read(a.getId()).getRemainingAmount()); assertEquals(2,read(a.getId()).getRemainingMonths());
    assertEquals(1,read(b.getId()).getRemainingMonths());
    assertEquals(2,installments.list().stream().filter(s->"PAID".equals(s.getState())).count());
    assertEquals(0,db.queryForObject("SELECT count(*) FROM ledger_entry",Integer.class));
    plans.payCard(cardId,new Commands.Payment(LocalDate.of(2030,3,2),new BigDecimal("130000"),start.plusMonths(1)),null);
    assertFalse(read(b.getId()).getActive()); assertEquals(0,read(b.getId()).getRemainingMonths());
    pay(occurrence(start.plusMonths(2)),"100000",LocalDate.of(2030,3,31));
    assertFalse(read(a.getId()).getActive()); money("0",read(a.getId()).getRemainingAmount());
    assertNull(occurrence(start.plusMonths(3)).getAmount());
    assertEquals(3,db.queryForObject("SELECT count(*) FROM card_payment WHERE card_id=?",Integer.class,cardId));
  }
  @Test void rejectsUnderpaymentWithoutChangingBalanceOrInstallments() {
    var x=add("300000",3); var o=occurrence(start);
    assertThrows(BusinessException.class,()->pay(o,"99999",o.getDueDate()));
    money("1000000",catalog.account(accountId).getCurrentBalanceKrw());
    assertEquals(3,read(x.getId()).getRemainingMonths());
    assertEquals("PENDING",plans.get(o.getId()).getState());
  }
  @Test void rejectsDuplicateAcrossPaymentEntryPoints() {
    var x=add("300000",3); var o=occurrence(start); pay(o,"100000",o.getDueDate());
    assertThrows(BusinessException.class,()->plans.payCard(cardId,new Commands.Payment(o.getDueDate(),new BigDecimal("100000")),null));
    money("900000",catalog.account(accountId).getCurrentBalanceKrw());
    assertEquals(2,read(x.getId()).getRemainingMonths());
  }
  @Test void editsPendingScheduleAndDeactivationRemovesFutureAmounts() {
    var x=add("300000",3); occurrence(start);
    x.setRemainingAmount(new BigDecimal("600000")); catalog.saveInstallment(x.getId(),x);
    money("200000",occurrence(start).getAmount());
    assertEquals(3,installments.list().stream().filter(s->"PENDING".equals(s.getState())).count());
    catalog.deactivateInstallment(x.getId()); assertNull(occurrence(start).getAmount());
    assertEquals(0,installments.list().stream().filter(s->"PENDING".equals(s.getState())).count());
  }
  @Test void changedCardPaymentDayDoesNotCreateSecondPaymentForCompletedMonth() {
    add("300000",3); var o=occurrence(start); pay(o,"100000",o.getDueDate());
    var c=catalog.card(cardId); c.setPaymentDay(20); catalog.saveCard(cardId,c);
    var rows=plans.month(start); assertEquals(1,rows.size()); assertEquals("COMPLETED",rows.getFirst().getState());
    assertEquals(20,occurrence(start.plusMonths(1)).getDueDate().getDayOfMonth());
  }
  @Test void blocksCancellationOfLinkedPayment() {
    add("300000",3); var o=occurrence(start);
    assertThrows(BusinessException.class,()->plans.cancel(o.getId()));
  }
  @Test void blocksModificationAfterPayment() {
    var x=add("300000",3); var o=occurrence(start); pay(o,"100000",o.getDueDate());
    var remaining=read(x.getId());
    assertThrows(BusinessException.class,()->catalog.saveInstallment(x.getId(),remaining));
  }
  @Test void preservesPaidHistoryOnDeactivation() {
    var x=add("300000",3); var o=occurrence(start); pay(o,"100000",o.getDueDate());
    catalog.deactivateInstallment(x.getId());
    assertEquals(1,installments.list().stream().filter(s->"PAID".equals(s.getState()) && s.getOccurrenceId().equals(o.getId())).count());
    assertNull(occurrence(start.plusMonths(1)).getAmount());
  }
  @Test void migratesExistingInstallmentsAndCanRunTwice() throws Exception {
    try(var c=DriverManager.getConnection(URL,"installment_test","");var s=c.createStatement()) {
      s.execute("CREATE SCHEMA migration_"+System.nanoTime());
      // This connection's own scratch schema is unrelated to the service fixtures.
      try(var r=s.executeQuery("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'migration_%' ORDER BY oid DESC LIMIT 1")) {
        r.next(); c.setSchema(r.getString(1));
      }
      String schema=Files.readString(Path.of("db/schema.sql"));
      schema=schema.substring(0,schema.indexOf("CREATE TABLE installment_schedule"))+"COMMIT;";
      schema=schema.replace(" first_payment_date date NOT NULL,","").replace("remaining_months BETWEEN 0 AND 120","remaining_months BETWEEN 1 AND 120");
      s.execute(schema);
      s.execute("INSERT INTO asset_account(id,asset_type,owner_code,institution_code,account_name,account_number,status) VALUES(1,'CASH','HUSBAND','KB','test','test','ACTIVE'); INSERT INTO payment_card(id,card_name,owner_code,card_type,account_id,payment_day,status) VALUES(1,'test','HUSBAND','CREDIT',1,31,'ACTIVE'); INSERT INTO initial_installment(card_id,remaining_months,remaining_amount) VALUES(1,3,100)");
      String migration=Files.readString(Path.of("db/migrations/20260912_installment_schedule.sql"));
      s.execute(migration); s.execute(migration);
      try(var r=s.executeQuery("SELECT count(*),sum(amount) FROM installment_schedule")) {
        r.next(); assertEquals(3,r.getInt(1)); money("100",r.getBigDecimal(2));
      }
    }
  }
}
