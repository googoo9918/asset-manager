package com.family.asset.kis;

import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.Holding;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class DailyPriceTest {
  final ObjectMapper json=new ObjectMapper();
  @Test void usesTradingDatesAndExactNativePricesRegardlessOfQuantityOrFx() {
    var result=DailyPrice.parse(json.readTree("""
      [{"xymd":"20260925","clos":"102.50"},{"xymd":"20260924","clos":"100"}]
      """),true);
    assertEquals(LocalDate.of(2026,9,25),result.date());assertEquals(LocalDate.of(2026,9,24),result.previousDate());
    assertEquals(0,new BigDecimal("2.5").compareTo(result.changePercent()));
    var h=new Holding();h.setQuantity(new BigDecimal("999"));h.setAveragePrice(new BigDecimal("200"));h.setExchangeRate(new BigDecimal("1500"));
    result.apply(h);assertEquals(result.changePercent(),h.getDailyReturn());assertNotNull(h.getPriceFetchedAt());
  }
  @Test void handlesUnsortedDatesWeekendLossAndUnchangedPrice() {
    var loss=DailyPrice.parse(json.readTree("""
      [{"stck_bsop_date":"20260925","stck_clpr":"10000"},{"stck_bsop_date":"20260928","stck_clpr":"9000"}]
      """),false);
    assertEquals(0,new BigDecimal("-10").compareTo(loss.changePercent()));
    assertEquals(LocalDate.of(2026,9,25),loss.previousDate());
    assertEquals(0,DailyPrice.parse(json.readTree("[{\"xymd\":\"20260925\",\"clos\":\"100\"},{\"xymd\":\"20260924\",\"clos\":\"100\"}]"),true).changePercent().signum());
  }
  @Test void missingZeroOrDuplicateQuoteNeverBecomesZeroPercent() {
    for(String rows:new String[]{"[]","[{\"xymd\":\"20260925\",\"clos\":\"100\"}]",
      "[{\"xymd\":\"20260925\",\"clos\":\"100\"},{\"xymd\":\"20260924\",\"clos\":\"0\"}]",
      "[{\"xymd\":\"20260925\",\"clos\":\"100\"},{\"xymd\":\"20260925\",\"clos\":\"101\"}]"})
      assertThrows(RuntimeException.class,()->DailyPrice.parse(json.readTree(rows),true));
  }
  @Test void mapsKnownExchangesWithoutGuessingUnknownSymbols() {
    assertEquals("NAS",KisClient.quoteExchange("NASD"));assertEquals("NYS",KisClient.quoteExchange("NYSE"));
    assertEquals("AMS",KisClient.quoteExchange("AMEX"));assertNull(KisClient.quoteExchange("OTC"));assertNull(KisClient.quoteExchange(null));
  }
}
