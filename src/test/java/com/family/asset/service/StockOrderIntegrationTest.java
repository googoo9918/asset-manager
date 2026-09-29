package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.kis.*;
import com.family.asset.mapper.StockOrderMapper;
import java.math.BigDecimal;
import java.nio.file.*;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import tools.jackson.databind.ObjectMapper;

@EnabledIfEnvironmentVariable(named="ASSET_INSTALLMENT_DB_TEST",matches="true")
@SpringJUnitConfig(InstallmentFlowIntegrationTest.Config.class)
class StockOrderIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired StockOrderMapper orders;
  @Autowired CatalogService catalog;
  KisProperties config;KisOrderClient broker;StockOrderService service;long accountId;
  final ObjectMapper json=new ObjectMapper();
  @BeforeAll static void schema() throws Exception {
    InstallmentFlowIntegrationTest.schema();
    try(var c=DriverManager.getConnection(InstallmentFlowIntegrationTest.URL,"installment_test","");var s=c.createStatement()) {s.execute(Files.readString(Path.of("db/migrate_stock_orders.sql")));}
  }
  @BeforeEach void setup() {
    accountId=db.queryForObject("INSERT INTO asset_account(account_name,account_number,status,asset_type,owner_code,institution_code,current_balance_krw,kis_linked) VALUES('order test','12345678-01','ACTIVE','SECURITIES','HUSBAND','KIS',1000000,true) RETURNING id",Long.class);
    config=new KisProperties();config.setEnabled(true);config.setTradingEnabled(true);config.setAppKey("test");config.setAppSecret("test");config.setBaseUrl("https://openapivts.koreainvestment.com:29443");
    broker=mock(KisOrderClient.class);when(broker.quote(any(),anyString(),anyString())).thenReturn(new BigDecimal("75000"));
    service=new StockOrderService(orders,catalog,config,broker);
    when(broker.submit(any(),any())).thenReturn(json.readTree("{\"rt_cd\":\"0\",\"output\":{\"ODNO\":\"0000123\",\"KRX_FWDG_ORD_ORGNO\":\"456\"}}"));
  }
  @AfterEach void cleanup() {db.update("DELETE FROM stock_order WHERE account_id=?",accountId);db.update("DELETE FROM asset_account WHERE id=?",accountId);}
  StockOrder preview(String exchange,String type) {return service.preview(new StockOrderRequest(accountId,exchange,exchange.equals("KRX")?"005930":"AAPL","BUY",type,new BigDecimal("2"),new BigDecimal("100")));}
  @Test void frozenQuoteAndDurableClaimSurviveConcurrentConfirmation() throws Exception {
    var o=preview("KRX","CURRENT");var started=new CountDownLatch(1);var release=new CountDownLatch(1);
    when(broker.submit(any(),any())).thenAnswer(inv->{
      // JdbcTemplate uses a different connection: this must be visible before POST.
      assertEquals("SENDING",db.queryForObject("SELECT status FROM stock_order WHERE id=?",String.class,o.getId()));
      assertEquals(0,new BigDecimal("75000").compareTo(inv.<StockOrder>getArgument(1).getPrice()));
      started.countDown();assertTrue(release.await(10,TimeUnit.SECONDS));return json.readTree("{\"rt_cd\":\"0\",\"output\":{\"ODNO\":\"0000123\"}}");
    });
    try(var pool=Executors.newFixedThreadPool(2)) {
      var first=pool.submit(()->service.confirm(o.getId()));assertTrue(started.await(10,TimeUnit.SECONDS));
      try {assertEquals("SENDING",service.confirm(o.getId()).getStatus());} finally {release.countDown();}
      assertEquals("ACCEPTED",first.get(10,TimeUnit.SECONDS).getStatus());
    }
    assertEquals("ACCEPTED",service.confirm(o.getId()).getStatus());verify(broker,times(1)).submit(any(),any());verify(broker,times(1)).quote(any(),anyString(),anyString());
    assertEquals("123",service.find(o.getId()).getBrokerOrderId());
    assertFalse(json.writeValueAsString(service.find(o.getId())).contains("accountBinding"));
    assertEquals(1,service.list("HUSBAND").stream().filter(x->x.getAccountId()==accountId).count());
    assertEquals(0,service.list("WIFE").stream().filter(x->x.getAccountId()==accountId).count());
    assertEquals(1,service.list("JOINT").stream().filter(x->x.getAccountId()==accountId).count());
    assertThrows(RuntimeException.class,()->service.list("INVALID"));
  }
  @Test void timeoutPersistsUnknownAndNeverResendsOrAllowsNewPreview() {
    var o=preview("KRX","MARKET");when(broker.submit(any(),any())).thenThrow(new IllegalStateException("lost response"));
    assertEquals("UNKNOWN",service.confirm(o.getId()).getStatus());assertEquals("UNKNOWN",service.confirm(o.getId()).getStatus());
    assertThrows(RuntimeException.class,()->preview("KRX","LIMIT"));verify(broker,times(1)).submit(any(),any());
    assertEquals(0,service.find(o.getId()).getPrice().signum());
  }
  @Test void expiryBindingAndDisabledTradingPreventSending() {
    var o=preview("KRX","LIMIT");db.update("UPDATE stock_order SET expires_at=now()-interval '1 second' WHERE id=?",o.getId());
    assertThrows(RuntimeException.class,()->service.confirm(o.getId()));
    var next=preview("KRX","LIMIT");config.setAppKey("changed");assertThrows(RuntimeException.class,()->service.confirm(next.getId()));
    config.setAppKey("test");config.setTradingEnabled(false);assertThrows(RuntimeException.class,()->service.confirm(next.getId()));
    verify(broker,never()).submit(any(),any());assertEquals("PREVIEW",service.find(next.getId()).getStatus());
  }
  @Test void rejectsUnsupportedMarketAndFractionalKrwPrice() {
    assertThrows(RuntimeException.class,()->preview("NASD","MARKET"));
    when(broker.quote(any(),anyString(),anyString())).thenReturn(new BigDecimal("1.5"));assertThrows(RuntimeException.class,()->preview("KRX","CURRENT"));
    verify(broker,never()).submit(any(),any());
  }
  void inquiry(String filled,String remaining,String cancelled) {
    when(broker.lookup(any(),any())).thenReturn(json.readTree("{\"tot_ccld_qty\":\""+filled+"\",\"rmn_qty\":\""+remaining+"\",\"avg_prvs\":\"75000\",\"cncl_yn\":\""+cancelled+"\",\"ord_gno_brno\":\"456\"}"));
  }
  @Test void partialFillCancellationOnlyBecomesFinalAfterBrokerConfirmation() {
    var o=preview("KRX","CURRENT");service.confirm(o.getId());inquiry("1","1","N");assertEquals("PARTIAL",service.sync(o.getId()).getStatus());
    when(broker.cancelable(any(),any())).thenReturn(BigDecimal.ONE);
    when(broker.cancel(any(),any(),any())).thenReturn(json.readTree("{\"rt_cd\":\"0\",\"output\":{\"ODNO\":\"0000124\"}}"));
    assertEquals("CANCEL_PENDING",service.cancel(o.getId()).getStatus());assertThrows(RuntimeException.class,()->service.cancel(o.getId()));
    inquiry("1","0","Y");assertEquals("CANCELLED",service.sync(o.getId()).getStatus());
    verify(broker,times(1)).cancel(any(),any(),eq(BigDecimal.ONE));
    assertEquals(0,new BigDecimal("1000000").compareTo(catalog.account(accountId).getCurrentBalanceKrw()));
  }
  @Test void fullFillWinsRaceWithCancelAndMissingInquiryDoesNotInferCancellation() {
    var o=preview("KRX","LIMIT");service.confirm(o.getId());
    when(broker.lookup(any(),any())).thenReturn(null);assertThrows(RuntimeException.class,()->service.sync(o.getId()));assertEquals("ACCEPTED",service.find(o.getId()).getStatus());
    inquiry("2","0","N");assertThrows(RuntimeException.class,()->service.cancel(o.getId()));assertEquals("FILLED",service.find(o.getId()).getStatus());verify(broker,never()).cancel(any(),any(),any());
  }
  @Test void unknownOrderCanBeLinkedAndInquiryUpdatesUseCompareAndSet() {
    var o=preview("KRX","LIMIT");when(broker.submit(any(),any())).thenReturn(json.readTree("{}"));assertEquals("UNKNOWN",service.confirm(o.getId()).getStatus());
    inquiry("0","2","N");var linked=service.link(o.getId(),"0000123");assertEquals("ACCEPTED",linked.getStatus());assertEquals("123",linked.getBrokerOrderId());
    var older=orders.find(o.getId());var newer=orders.find(o.getId());newer.setMessage("new");assertEquals(1,orders.update(newer));older.setMessage("stale");assertEquals(0,orders.update(older));assertEquals("new",orders.find(o.getId()).getMessage());
  }
  @Test void explicitRejectionIsNotMistakenForAcceptedOrder() {
    var o=preview("KRX","LIMIT");when(broker.submit(any(),any())).thenReturn(json.readTree("{\"rt_cd\":\"1\",\"msg1\":\"잔액 부족\"}"));
    assertEquals("REJECTED",service.confirm(o.getId()).getStatus());verify(broker,times(1)).submit(any(),any());
  }
  @Test void lostCancellationResponseNeverRetriesAndStaleRemainingCannotReopenFinalOrder() {
    var o=preview("KRX","LIMIT");service.confirm(o.getId());inquiry("1","1","N");
    when(broker.cancelable(any(),any())).thenReturn(BigDecimal.ONE);
    when(broker.cancel(any(),any(),any())).thenThrow(new IllegalStateException("lost cancel response"));
    assertEquals("CANCEL_UNKNOWN",service.cancel(o.getId()).getStatus());
    assertThrows(RuntimeException.class,()->service.cancel(o.getId()));verify(broker,times(1)).cancel(any(),any(),any());
    inquiry("1","0","Y");assertEquals("CANCELLED",service.sync(o.getId()).getStatus());
    inquiry("1","1","N");assertThrows(RuntimeException.class,()->service.sync(o.getId()));assertEquals(0,service.find(o.getId()).getRemainingQuantity().signum());
  }
}
