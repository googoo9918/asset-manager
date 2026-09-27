package com.family.asset.kis;

import static com.family.asset.exception.BusinessException.check;
import com.family.asset.dto.Holding;
import java.math.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import tools.jackson.databind.JsonNode;

/** Both prices and their trading dates come from the same adjusted daily-price response. */
public record DailyPrice(LocalDate date, LocalDate previousDate, BigDecimal previousClose,
    BigDecimal price, BigDecimal changePercent) {
  public static DailyPrice parse(JsonNode rows, boolean overseas) {
    check(rows.isArray(), "종목 일별시세 형식 오류");
    String dateKey=overseas?"xymd":"stck_bsop_date", priceKey=overseas?"clos":"stck_clpr";
    var prices=new TreeMap<LocalDate,BigDecimal>();
    for(var row:rows) {
      var date=LocalDate.parse(row.path(dateKey).asText(),DateTimeFormatter.BASIC_ISO_DATE);
      var value=KisClient.number(row,priceKey);
      check(prices.putIfAbsent(date,value)==null,"종목 시세일 중복");
    }
    check(prices.size()>=2,"전일 종가 자료 부족");
    var current=prices.lastEntry();var previous=prices.lowerEntry(current.getKey());
    check(current.getValue().signum()>0 && previous.getValue().signum()>0,"유효한 종가가 없습니다.");
    var rate=current.getValue().subtract(previous.getValue()).multiply(new BigDecimal("100"))
        .divide(previous.getValue(),8,RoundingMode.HALF_UP);
    return new DailyPrice(current.getKey(),previous.getKey(),previous.getValue(),current.getValue(),rate);
  }
  public void apply(Holding h) {
    h.setPriceDate(date);h.setPreviousPriceDate(previousDate);h.setPreviousClose(previousClose);
    h.setDayPrice(price);h.setDailyReturn(changePercent);h.setPriceFetchedAt(OffsetDateTime.now());
  }
}
