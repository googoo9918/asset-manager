package com.family.asset.kis;

import static com.family.asset.exception.BusinessException.*;

import com.family.asset.dto.*;
import com.family.asset.exception.BusinessException;
import java.math.*;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.*;

@Component
@RequiredArgsConstructor
@Slf4j
public class KisClient {
  private static final long MIN_REQUEST_INTERVAL_MILLIS = 150;
  private static final int RATE_LIMIT_RETRIES = 4;

  private final KisProperties config;
  private final ObjectMapper json;
  private final Map<String, Token> tokens = new HashMap<>();
  private long lastRequestNanos;

  private record Token(String value, Instant expires) {}

  private synchronized void waitForRequestSlot() {
    long intervalNanos = MIN_REQUEST_INTERVAL_MILLIS * 1_000_000L;
    long remaining = intervalNanos - (System.nanoTime() - lastRequestNanos);
    if (remaining > 0) sleep((remaining + 999_999L) / 1_000_000L);
    lastRequestNanos = System.nanoTime();
  }

  private void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new BusinessException("KIS 조회 대기 중 작업이 중단되었습니다.");
    }
  }

  private <T> T call(Supplier<T> request) {
    for (int attempt = 0; ; attempt++) {
      waitForRequestSlot();
      try {
        return request.get();
      } catch (RestClientResponseException e) {
        boolean rateLimited = e.getResponseBodyAsString().contains("EGW00201");
        if (!rateLimited || attempt >= RATE_LIMIT_RETRIES) throw e;
        sleep(700L * (attempt + 1));
      }
    }
  }

  private RestClient client() {
    var f =
        new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    f.setReadTimeout(Duration.ofSeconds(20));
    return RestClient.builder().baseUrl(config.getBaseUrl()).requestFactory(f).build();
  }

  private synchronized String token(KisProperties.Credential c) {
    check(!c.getAppKey().isBlank() && !c.getAppSecret().isBlank(), "KIS 인증정보가 없습니다.");
    var old = tokens.get(c.getAppKey());
    if (old != null && old.expires().isAfter(Instant.now())) return old.value();
    var body =
        call(
            () ->
                client()
                    .post()
                    .uri("/oauth2/tokenP")
                    .body(
                        Map.of(
                            "grant_type",
                            "client_credentials",
                            "appkey",
                            c.getAppKey(),
                            "appsecret",
                            c.getAppSecret()))
                    .retrieve()
                    .body(JsonNode.class));
    check(body != null && body.has("access_token"), "KIS 토큰 발급에 실패했습니다.");
    String token = body.path("access_token").asText();
    tokens.put(
        c.getAppKey(),
        new Token(token, Instant.now().plusSeconds(body.path("expires_in").asLong(86400) - 120)));
    return token;
  }

  private List<JsonNode> pages(
      KisProperties.Credential c,
      String path,
      String tr,
      Map<String, String> params,
      String cursor) {
    return pages(c,path,tr,params,cursor,false);
  }

  public List<JsonNode> tradingGet(Account account, String path, String tr, Map<String,String> params, String cursor) {
    return pages(config.credentials(account.getId()),path,tr,new LinkedHashMap<>(params),cursor);
  }

  /** Mutating broker calls are sent exactly once. Never pass them through the read retry helper. */
  public JsonNode tradingPost(Account account, String path, String tr, Map<String,String> params) {
    var c=config.credentials(account.getId());
    var accessToken=token(c);
    waitForRequestSlot();
    return client().post().uri(path).header("authorization","Bearer "+accessToken)
        .header("appkey",c.getAppKey()).header("appsecret",c.getAppSecret()).header("tr_id",tr)
        .header("custtype","P").body(params).retrieve().body(JsonNode.class);
  }

  private List<JsonNode> pages(KisProperties.Credential c, String path, String tr,
      Map<String,String> params, String cursor, boolean firstPageOnly) {
    List<JsonNode> all = new ArrayList<>();
    String cont = "";
    Set<String> seen = new HashSet<>();
    for (int page = 0; page < 100; page++) {
      String next = cont;
      String accessToken = token(c);
      var response =
          call(
              () ->
                  client()
                      .get()
                      .uri(
                          b -> {
                            b.path(path);
                            params.forEach(b::queryParam);
                            return b.build();
                          })
                      .header("authorization", "Bearer " + accessToken)
                      .header("appkey", c.getAppKey())
                      .header("appsecret", c.getAppSecret())
                      .header("tr_id", tr)
                      .header("custtype", "P")
                      .header("tr_cont", next)
                      .retrieve()
                      .toEntity(JsonNode.class));
      var body = require(response.getBody(), "KIS 응답");
      check("0".equals(body.path("rt_cd").asText()), "KIS 조회 실패: " + body.path("msg_cd").asText());
      all.add(body);
      if (firstPageOnly) return all;
      String more = response.getHeaders().getFirst("tr_cont");
      if (!"M".equals(more) && !"F".equals(more)) return all;
      check(cursor != null, "KIS 응답이 단일 조회 범위를 초과했습니다. 기존 상태를 유지합니다.");
      String fk = body.path("ctx_area_fk" + cursor).asText(),
          nk = body.path("ctx_area_nk" + cursor).asText();
      check(seen.add(fk + ":" + nk), "KIS 연속조회 키가 반복되었습니다.");
      params.put("CTX_AREA_FK" + cursor, fk);
      params.put("CTX_AREA_NK" + cursor, nk);
      cont = "N";
    }
    throw new BusinessException("KIS 연속조회 상한을 초과했습니다. 기존 데이터를 유지합니다.");
  }

  public static BigDecimal number(JsonNode row, String key) {
    check(row.has(key) && !row.path(key).asText().isBlank(), "KIS 필수 응답 누락: " + key);
    return new BigDecimal(row.path(key).asText().replace(",", ""));
  }

  private List<JsonNode> rows(JsonNode body, String key) {
    check(body.has(key), "KIS 응답 필드 누락: " + key);
    var node = body.path(key);
    List<JsonNode> r = new ArrayList<>();
    if (node.isArray()) node.forEach(r::add);
    else if (node.isObject()) r.add(node);
    else check(node.isNull(), "KIS 응답 형식 오류: " + key);
    return r;
  }

  private Map<String, String> base(Account a) {
    String account = a.getAccountNumber().replaceAll("[^0-9]", "");
    check(account.length() == 10, "KIS 계좌번호는 8자리-상품코드2자리 형식이어야 합니다.");
    return new LinkedHashMap<>(
        Map.of("CANO", account.substring(0, 8), "ACNT_PRDT_CD", account.substring(8)));
  }

  public BrokerState fetch(Account a) {
    check(config.isEnabled(), "KIS 연동이 비활성화되어 있습니다.");
    var c = config.credentials(a.getId());
    var p = base(a);
    p.putAll(
        Map.of(
            "AFHR_FLPR_YN",
            "N",
            "OFL_YN",
            "",
            "INQR_DVSN",
            "02",
            "UNPR_DVSN",
            "01",
            "FUND_STTL_ICLD_YN",
            "N",
            "FNCG_AMT_AUTO_RDPT_YN",
            "N",
            "PRCS_DVSN",
            "00",
            "CTX_AREA_FK100",
            "",
            "CTX_AREA_NK100",
            ""));
    List<Holding> hh = new ArrayList<>();
    Map<String,String> exchanges = new HashMap<>();
    BigDecimal cashKrw = BigDecimal.ZERO;
    for (var body :
        pages(c, "/uapi/domestic-stock/v1/trading/inquire-balance", "TTTC8434R", p, "100")) {
      for (var r : rows(body, "output1")) {
        if (number(r, "hldg_qty").signum() == 0) continue;
        hh.add(
            holding(
                a.getId(),
                r.path("pdno").asText(),
                r.path("prdt_name").asText(),
                "KRW",
                number(r, "hldg_qty"),
                number(r, "pchs_avg_pric"),
                number(r, "prpr"),
                number(r, "evlu_amt"),
                BigDecimal.ONE));
      }
      var sum = rows(body, "output2");
      check(!sum.isEmpty(), "KIS 국내잔고 합계 누락");
      cashKrw = number(sum.getFirst(), "dnca_tot_amt");
    }
    p = base(a);
    p.putAll(
        Map.of(
            "WCRC_FRCR_DVSN_CD", "02", "NATN_CD", "000", "TR_MKET_CD", "00", "INQR_DVSN_CD", "00"));
    var foreign =
        pages(c, "/uapi/overseas-stock/v1/trading/inquire-present-balance", "CTRP6504R", p, null)
            .getFirst();
    BigDecimal cashUsd = BigDecimal.ZERO, fx = null;
    for (var r : rows(foreign, "output2")) {
      String currency = r.path("crcy_cd").asText();
      var amt = number(r, "frcr_dncl_amt_2");
      check(
          currency.equals("USD") || amt.signum() == 0,
          "현재 구현은 KRW/USD 평가만 지원합니다. 다른 통화 잔고가 있어 갱신을 중단했습니다.");
      if (currency.equals("USD")) {
        cashUsd = amt;
        fx = number(r, "frst_bltn_exrt");
      }
    }
    for (var r : rows(foreign, "output1")) {
      if (number(r, "cblc_qty13").signum() == 0) continue;
      check("USD".equals(r.path("buy_crcy_cd").asText()), "USD 이외 해외 보유종목이 있어 갱신을 중단했습니다.");
      var rate = number(r, "bass_exrt");
      if (fx == null) fx = rate;
      String symbol = r.path("pdno").asText();
      exchanges.put(symbol, r.path("ovrs_excg_cd").asText());
      hh.add(
          holding(
              a.getId(),
              symbol,
              symbol,
              "USD",
              number(r, "cblc_qty13"),
              number(r, "avg_unpr3"),
              number(r, "ovrs_now_pric1"),
              number(r, "frcr_evlu_amt2"),
              rate));
    }
    if (fx == null) fx = a.getExchangeRate();
    check(fx.signum() > 0, "유효한 API 환율이 없습니다.");
    List<SecurityTrade> tt = fetchTrades(a, c, fx);
    for (var h : hh) {
      boolean overseas = "USD".equals(h.getCurrencyCode());
      h.setExchangeCode(overseas ? quoteExchange(exchanges.get(h.getSymbol())) : "KRX");
      try {
        check(h.getExchangeCode()!=null,"지원하지 않는 시세 거래소");
        var priceRows = overseas
            ? pages(c,"/uapi/overseas-price/v1/quotations/dailyprice","HHDFS76240000",
                new LinkedHashMap<>(Map.of("AUTH","","EXCD",h.getExchangeCode(),"SYMB",h.getSymbol(),"GUBN","0","BYMD","","MODP","1")),null,true).getFirst().path("output2")
            : pages(c,"/uapi/domestic-stock/v1/quotations/inquire-daily-price","FHKST01010400",
                new LinkedHashMap<>(Map.of("FID_COND_MRKT_DIV_CODE","J","FID_INPUT_ISCD",h.getSymbol(),"FID_PERIOD_DIV_CODE","D","FID_ORG_ADJ_PRC","1")),null,true).getFirst().path("output");
        DailyPrice.parse(priceRows,overseas).apply(h);
      } catch (RuntimeException e) {
        // An optional quote failure must not discard a successfully fetched account balance.
        log.warn("Daily price unavailable, accountId={}, symbol={}, reason={}",a.getId(),h.getSymbol(),e.getClass().getSimpleName());
      }
    }
    return new BrokerState(cashKrw, cashUsd, fx, hh, tt);
  }

  static String quoteExchange(String code) {
    if(code==null) return null;
    return switch(code) {case "NASD", "NAS" -> "NAS"; case "NYSE", "NYS" -> "NYS";
      case "AMEX", "AMS" -> "AMS"; default -> null;};
  }

  private Holding holding(
      Long account,
      String symbol,
      String name,
      String currency,
      BigDecimal qty,
      BigDecimal avg,
      BigDecimal price,
      BigDecimal value,
      BigDecimal fx) {
    check(!symbol.isBlank() && fx.signum() > 0, "KIS 종목코드/환율 오류");
    var h = new Holding();
    h.setAccountId(account);
    h.setSymbol(symbol);
    h.setName(name);
    h.setCurrencyCode(currency);
    h.setQuantity(qty);
    h.setAveragePrice(avg);
    h.setCurrentPrice(price);
    h.setValueNative(value);
    h.setExchangeRate(fx);
    h.setValueKrw(value.multiply(fx).setScale(2, RoundingMode.HALF_UP));
    return h;
  }

  private List<SecurityTrade> fetchTrades(Account a, KisProperties.Credential c, BigDecimal fx) {
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
    LocalDate start =
        a.getLastSyncedAt() == null
            ? today.minusMonths(3)
            : a.getLastSyncedAt()
                .atZoneSameInstant(ZoneId.of("Asia/Seoul"))
                .toLocalDate()
                .minusDays(7);
    var p = base(a);
    p.putAll(
        Map.of(
            "ERLM_STRT_DT",
            start.format(DateTimeFormatter.BASIC_ISO_DATE),
            "ERLM_END_DT",
            today.format(DateTimeFormatter.BASIC_ISO_DATE),
            "OVRS_EXCG_CD",
            "NAS",
            "PDNO",
            "",
            "SLL_BUY_DVSN_CD",
            "00",
            "LOAN_DVSN_CD",
            "",
            "CTX_AREA_FK100",
            "",
            "CTX_AREA_NK100",
            ""));
    List<SecurityTrade> trades = new ArrayList<>();
    Map<String, Integer> duplicates = new HashMap<>();
    for (var b :
        pages(c, "/uapi/overseas-stock/v1/trading/inquire-period-trans", "CTOS4001R", p, "100"))
      for (var r : rows(b, "output1")) {
        String side = r.path("sll_buy_dvsn_cd").asText();
        if (!side.equals("01") && !side.equals("02")) continue;
        var t = new SecurityTrade();
        t.setAccountId(a.getId());
        String hash = digest(r.toString());
        int occurrence = duplicates.merge(hash, 1, Integer::sum);
        t.setExternalId("KIS-US:" + hash + ":" + occurrence);
        t.setTradeDate(
            LocalDate.parse(r.path("trad_dt").asText(), DateTimeFormatter.BASIC_ISO_DATE));
        t.setTradeType(side.equals("01") ? "SELL" : "BUY");
        t.setSymbol(r.path("pdno").asText());
        t.setCurrencyCode(r.path("crcy_cd").asText());
        t.setQuantity(number(r, "ccld_qty"));
        t.setAmount(number(r, "tr_frcr_amt2"));
        t.setExchangeRate(fx);
        trades.add(t);
      }
    return trades;
  }

  private String digest(String s) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
