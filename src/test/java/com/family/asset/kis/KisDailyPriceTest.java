package com.family.asset.kis;

import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.Account;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class KisDailyPriceTest {
  @Test void fetchesDailyPricesAndKeepsBalancesWhenOptionalQuoteFails() throws Exception {
    var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
    List<String> requests=new ArrayList<>();
    server.createContext("/",exchange->{
      String path=exchange.getRequestURI().getPath();requests.add(exchange.getRequestURI().toString());
      String body=switch(path){
        case "/oauth2/tokenP" -> "{\"access_token\":\"test-only\",\"expires_in\":86400}";
        case "/uapi/domestic-stock/v1/trading/inquire-balance" -> """
          {"rt_cd":"0","output1":[{"pdno":"005930","prdt_name":"국내","hldg_qty":"1","pchs_avg_pric":"100","prpr":"110","evlu_amt":"110"}],"output2":[{"dnca_tot_amt":"200"}]}
          """;
        case "/uapi/overseas-stock/v1/trading/inquire-present-balance" -> """
          {"rt_cd":"0","output1":[{"pdno":"TEST","cblc_qty13":"2","buy_crcy_cd":"USD","bass_exrt":"1300","avg_unpr3":"100","ovrs_now_pric1":"102.5","frcr_evlu_amt2":"205","ovrs_excg_cd":"NASD"}],"output2":[{"crcy_cd":"USD","frcr_dncl_amt_2":"10","frst_bltn_exrt":"1300"}]}
          """;
        case "/uapi/overseas-stock/v1/trading/inquire-period-trans" -> "{\"rt_cd\":\"0\",\"output1\":[]}";
        case "/uapi/domestic-stock/v1/quotations/inquire-daily-price" -> "{\"rt_cd\":\"1\",\"msg_cd\":\"TEST_UNAVAILABLE\"}";
        case "/uapi/overseas-price/v1/quotations/dailyprice" -> """
          {"rt_cd":"0","output2":[{"xymd":"20260925","clos":"102.5"},{"xymd":"20260924","clos":"100"}]}
          """;
        default -> "{\"rt_cd\":\"1\",\"msg_cd\":\"UNEXPECTED\"}";
      };
      exchange.getResponseHeaders().set("Content-Type","application/json");
      if(path.endsWith("/dailyprice"))exchange.getResponseHeaders().set("tr_cont","M");
      var bytes=body.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);
      try(var out=exchange.getResponseBody()){out.write(bytes);}
    });
    server.start();
    try {
      var config=new KisProperties();config.setEnabled(true);config.setBaseUrl("http://127.0.0.1:"+server.getAddress().getPort());config.setAppKey("test");config.setAppSecret("test");
      var a=new Account();a.setId(1L);a.setAccountNumber("12345678-01");a.setExchangeRate(new BigDecimal("1300"));a.setLastSyncedAt(OffsetDateTime.now());
      var result=new KisClient(config,new ObjectMapper()).fetch(a);
      assertEquals(2,result.holdings().size());assertEquals(new BigDecimal("200"),result.depositKrw());
      var domestic=result.holdings().getFirst();assertNull(domestic.getDailyReturn());assertEquals(new BigDecimal("110"),domestic.getCurrentPrice());
      var foreign=result.holdings().getLast();assertEquals("NAS",foreign.getExchangeCode());assertEquals(0,new BigDecimal("2.5").compareTo(foreign.getDailyReturn()));
      assertTrue(requests.stream().anyMatch(r->r.contains("EXCD=NAS")&&r.contains("MODP=1")&&r.contains("GUBN=0")));
      assertEquals(1,requests.stream().filter(r->r.contains("/dailyprice")).count());
    } finally {server.stop(0);}
  }
}
