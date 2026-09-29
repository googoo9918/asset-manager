package com.family.asset.kis;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

class KisOrderClientTest {
  final ObjectMapper json=new ObjectMapper();
  Account account() {var a=new Account();a.setId(1L);a.setAccountNumber("12345678-01");return a;}
  StockOrder order(String exchange,String side,String type,String environment) {
    var o=new StockOrder();o.setExchange(exchange);o.setSymbol(exchange.equals("KRX")?"005930":"AAPL");o.setSide(side);o.setOrderType(type);o.setEnvironment(environment);
    o.setQuantity(new BigDecimal("2"));o.setPrice(type.equals("MARKET")?new BigDecimal("0.0000"):new BigDecimal("100.0000"));return o;
  }
  @Test void allSupportedModesUseCorrectTransactionIdsAndPreciseBodies() {
    for(String env:List.of("REAL","DEMO"))for(String exchange:List.of("KRX","NASD","NYSE","AMEX"))for(String side:List.of("BUY","SELL"))for(String type:List.of("LIMIT","CURRENT","MARKET")) {
      var client=mock(KisClient.class);var broker=new KisOrderClient(client);var a=account();var o=order(exchange,side,type,env);
      boolean kr=exchange.equals("KRX"),buy=side.equals("BUY"),demo=env.equals("DEMO");
      if(!kr&&type.equals("MARKET")){assertThrows(RuntimeException.class,()->broker.submit(a,o));verifyNoInteractions(client);continue;}
      broker.submit(a,o);
      @SuppressWarnings("unchecked") ArgumentCaptor<Map<String,String>> body=ArgumentCaptor.forClass(Map.class);
      String tr=kr?(buy?"TTTC0012U":"TTTC0011U"):(buy?"TTTT1002U":"TTTT1006U");
      if(demo)tr=kr?"V"+tr.substring(1):(buy?"VTTT1002U":"VTTT1001U");
      verify(client).tradingPost(eq(a),eq(kr?"/uapi/domestic-stock/v1/trading/order-cash":"/uapi/overseas-stock/v1/trading/order"),eq(tr),body.capture());
      var p=body.getValue();assertEquals("12345678",p.get("CANO"));assertEquals("01",p.get("ACNT_PRDT_CD"));assertEquals("2",p.get("ORD_QTY"));
      assertEquals(type.equals("MARKET")?"01":"00",p.get("ORD_DVSN"));
      assertEquals(kr?(type.equals("MARKET")?"0":"100"):"100.0000",p.get(kr?"ORD_UNPR":"OVRS_ORD_UNPR"));
      if(!kr)assertEquals(exchange,p.get("OVRS_EXCG_CD"));
    }
  }
  @Test void rateLimitedFinancialPostIsNeverRetried() throws Exception {
    var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var posts=new AtomicInteger();
    server.createContext("/",e->{
      boolean token=e.getRequestURI().getPath().equals("/oauth2/tokenP");
      if(!token)posts.incrementAndGet();
      var body=(token?"{\"access_token\":\"test-only\",\"expires_in\":86400}":"{\"rt_cd\":\"1\",\"msg_cd\":\"EGW00201\"}").getBytes(StandardCharsets.UTF_8);
      e.getResponseHeaders().set("Content-Type","application/json");e.sendResponseHeaders(token?200:500,body.length);
      try(var out=e.getResponseBody()){out.write(body);}
    });server.start();
    try {
      var config=new KisProperties();config.setBaseUrl("http://127.0.0.1:"+server.getAddress().getPort());config.setAppKey("test");config.setAppSecret("test");
      var broker=new KisOrderClient(new KisClient(config,json));
      var result=broker.submit(account(),order("KRX","BUY","MARKET","DEMO"));
      assertEquals("1",result.path("rt_cd").asText());
      assertEquals("EGW00201",result.path("msg_cd").asText());
      assertEquals(1,posts.get());
    } finally {server.stop(0);}
  }
  @Test void lookupRequiresMatchingIdentityAndPrice() {
    var client=mock(KisClient.class);var broker=new KisOrderClient(client);var a=account();var o=order("NASD","BUY","CURRENT","DEMO");
    o.setBrokerOrderId("123");o.setOrderDate(LocalDate.of(2026,9,25));
    when(client.tradingGet(eq(a),anyString(),eq("VTTS3035R"),anyMap(),eq("200"))).thenReturn(List.of(json.readTree("""
      {"output":[{"odno":"0000123","ord_dt":"20260925","pdno":"AAPL","sll_buy_dvsn_cd":"02","ft_ord_qty":"2","ft_ord_unpr3":"101","ovrs_excg_cd":"NASD"}]}
      """)));
    assertThrows(RuntimeException.class,()->broker.lookup(a,o));o.setPrice(new BigDecimal("101"));assertNotNull(broker.lookup(a,o));
  }
  @Test void candidatesNeedNoOrderNumberAndNeverSubmitOrSelectAnOrder() {
    var client=mock(KisClient.class);var broker=new KisOrderClient(client);var a=account();
    var o=order("NASD","BUY","CURRENT","REAL");o.setOrderDate(LocalDate.of(2026,9,28));
    var row=json.readTree("""
      {"odno":"0000123","ord_dt":"20260928","ord_tmd":"103000","pdno":"AAPL","sll_buy_dvsn_cd":"02","ft_ord_qty":"2","ft_ord_unpr3":"100","ovrs_excg_cd":"NASD"}
      """);
    var output=json.createObjectNode();var rows=output.putArray("output");rows.add(row);
    rows.add(json.readTree(row.toString().replace("0000123","0000124")));
    rows.add(json.readTree(row.toString().replace("AAPL","AMD")));
    rows.add(json.readTree(row.toString().replace("20260928","20260927")));
    rows.add(json.readTree(row.toString().replace("\"100\"","\"101\"")));
    rows.add(json.readTree(row.toString().replace("\"02\"","\"01\"")));
    rows.add(json.readTree(row.toString().replace("NASD","NYSE")));
    when(client.tradingGet(eq(a),anyString(),eq("TTTS3035R"),anyMap(),eq("200"))).thenReturn(List.of(output));
    var found=broker.candidates(a,o);
    assertEquals(List.of("123","124"),found.stream().map(KisOrderClient.Candidate::brokerOrderId).toList());
    assertNull(o.getBrokerOrderId());
    verify(client).tradingGet(eq(a),anyString(),eq("TTTS3035R"),argThat(p->p.get("ODNO").isEmpty()),eq("200"));
    verifyNoMoreInteractions(client);
    when(client.tradingGet(eq(a),anyString(),anyString(),anyMap(),anyString())).thenReturn(List.of(json.readTree("{\"output\":[]}")));
    assertTrue(broker.candidates(a,o).isEmpty());
  }
  @Test void ambiguousHttpFailureStillThrowsAndIsNeverRetried() throws Exception {
    for(String response:List.of("<html>Bad Gateway</html>","{\"rt_cd\":\"0\"}","{\"rt_cd\":\"1\"}")) {
      var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var posts=new AtomicInteger();
      server.createContext("/",e->{
        boolean token=e.getRequestURI().getPath().equals("/oauth2/tokenP");
        if(!token)posts.incrementAndGet();
        var body=(token?"{\"access_token\":\"test\",\"expires_in\":86400}":response).getBytes(StandardCharsets.UTF_8);
        e.getResponseHeaders().set("Content-Type","application/json");e.sendResponseHeaders(token?200:502,body.length);
        try(var out=e.getResponseBody()){out.write(body);}
      });server.start();
      try {
        var config=new KisProperties();config.setBaseUrl("http://127.0.0.1:"+server.getAddress().getPort());config.setAppKey("test");config.setAppSecret("test");
        var broker=new KisOrderClient(new KisClient(config,json));
        assertThrows(RuntimeException.class,()->broker.submit(account(),order("NASD","BUY","CURRENT","REAL")));
        assertEquals(1,posts.get());
      } finally {server.stop(0);}
    }
  }
  @Test void cancelUsesOriginalOrderAndDomesticBranch() {
    var client=mock(KisClient.class);var broker=new KisOrderClient(client);var a=account();var o=order("KRX","SELL","LIMIT","REAL");o.setBrokerOrderId("123");o.setBrokerBranch("456");
    broker.cancel(a,o,BigDecimal.ONE);
    verify(client).tradingPost(eq(a),eq("/uapi/domestic-stock/v1/trading/order-rvsecncl"),eq("TTTC0013U"),argThat(p->p.get("ORGN_ODNO").equals("123")&&p.get("KRX_FWDG_ORD_ORGNO").equals("456")&&p.get("RVSE_CNCL_DVSN_CD").equals("02")&&p.get("ORD_QTY").equals("1")));
  }
}
