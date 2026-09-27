package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.*;
import java.nio.file.*;
import java.sql.DriverManager;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@EnabledIfEnvironmentVariable(named="ASSET_INSTALLMENT_DB_TEST", matches="true")
@SpringJUnitConfig(InstallmentFlowIntegrationTest.Config.class)
@Transactional
class DailyPriceHistoryIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired HoldingMapper holdings;
  @Autowired OperationMapper ops;
  final ObjectMapper json=new ObjectMapper();
  @BeforeAll static void schema() throws Exception {
    InstallmentFlowIntegrationTest.schema();
    try(var c=DriverManager.getConnection(InstallmentFlowIntegrationTest.URL,"installment_test","");var s=c.createStatement()) {
      s.execute(Files.readString(Path.of("db/migrate_daily_price.sql")));
    }
  }
  Account account(OwnerCode owner) {
    var a=new Account();
    a.setId(db.queryForObject("INSERT INTO asset_account(account_name,account_number,status,asset_type,owner_code,institution_code,current_balance_krw) VALUES('historical',?,'ACTIVE','SECURITIES',?,'KIS',1000) RETURNING id",Long.class,"daily-price-"+owner.name(),owner.name()));
    a.setAccountName("historical");a.setOwnerCode(owner);a.setAssetType(AssetType.SECURITIES);a.setCurrentBalanceKrw(new BigDecimal("1000"));return a;
  }
  Holding holding(Account a) {
    var h=new Holding();h.setAccountId(a.getId());h.setSymbol("TEST");h.setName("test");h.setCurrencyCode("USD");h.setQuantity(BigDecimal.ONE);
    h.setAveragePrice(new BigDecimal("80"));h.setCurrentPrice(new BigDecimal("102"));h.setValueNative(new BigDecimal("102"));h.setValueKrw(new BigDecimal("132600"));h.setExchangeRate(new BigDecimal("1300"));
    h.setExchangeCode("NAS");h.setPriceDate(LocalDate.of(2030,1,4));h.setPreviousPriceDate(LocalDate.of(2030,1,3));
    h.setPreviousClose(new BigDecimal("100"));h.setDayPrice(new BigDecimal("102"));h.setDailyReturn(new BigDecimal("2"));h.setPriceFetchedAt(OffsetDateTime.parse("2030-01-05T07:00:00+09:00"));holdings.insert(h);return h;
  }
  @Test void persistsQuotesInSnapshotsDeduplicatesTradingDateAndFiltersHistoricalOwner() {
    var husband=account(OwnerCode.HUSBAND);var wife=account(OwnerCode.WIFE);var h=holding(husband);holding(wife);
    var catalog=mock(CatalogService.class);when(catalog.accounts()).thenReturn(List.of(husband,wife));when(catalog.loans()).thenReturn(List.of());
    when(catalog.account(husband.getId())).thenReturn(husband);when(catalog.account(wife.getId())).thenReturn(wife);
    var query=mock(QueryService.class);when(query.summary("JOINT")).thenReturn(new HashMap<>(Map.of("assets",new BigDecimal("2000"),"debts",BigDecimal.ZERO,"net",new BigDecimal("2000"))));
    var service=new SnapshotService(ops,catalog,query,holdings,json);
    service.capture("test");
    var saved=holdings.findById(h.getId());assertEquals(h.getPriceDate(),saved.getPriceDate());assertEquals(0,h.getPreviousClose().compareTo(saved.getPreviousClose()));
    h.setDailyReturn(new BigDecimal("3"));h.setDayPrice(new BigDecimal("103"));h.setPriceFetchedAt(h.getPriceFetchedAt().plusHours(1));holdings.update(h);service.capture("test");
    var from=LocalDate.of(2030,1,1);var to=LocalDate.of(2030,1,31);
    var all=service.dailyPrices("JOINT",from,to,null);assertEquals(2,all.size());
    var single=service.dailyPrices("HUSBAND",from,to,null);assertEquals(1,single.size());
    var details=json.readTree(single.getFirst().get("details").toString());assertEquals("historical",details.path("accountName").asText());assertEquals(0,new BigDecimal("3").compareTo(new BigDecimal(details.path("dailyReturn").asText())));
    assertEquals(0,service.dailyPrices("WIFE",from,to,husband.getId()).size());
    assertEquals(0,service.dailyPrices("JOINT",to,to,null).size());
    ops.clearHoldings(husband.getId());service.capture("test");
    assertEquals(1,service.dailyPrices("HUSBAND",from,to,null).size());
    assertThrows(RuntimeException.class,()->service.dailyPrices("JOINT",to,from,null));
  }
}
