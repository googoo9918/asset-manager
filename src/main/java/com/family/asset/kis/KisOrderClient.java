package com.family.asset.kis;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
import java.math.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
@RequiredArgsConstructor
public class KisOrderClient {
  private final KisClient client;
  private static final DateTimeFormatter DAY=DateTimeFormatter.BASIC_ISO_DATE;
  private String tr(StockOrder o,String real,String demo) {return "DEMO".equals(o.getEnvironment())?demo:real;}
  private Map<String,String> base(Account a) {
    String n=a.getAccountNumber().replaceAll("[^0-9]","");check(n.length()==10,"KIS 계좌번호를 확인해주세요.");
    return new LinkedHashMap<>(Map.of("CANO",n.substring(0,8),"ACNT_PRDT_CD",n.substring(8)));
  }
  private List<JsonNode> get(Account a,String path,String tr,Map<String,String> p,String cursor,String field) {
    var result=new ArrayList<JsonNode>();
    for(var body:client.tradingGet(a,path,tr,p,cursor)) {
      var rows=body.path(field);check(rows.isArray()||rows.isObject(),"KIS 조회 결과가 누락되었습니다.");
      if(rows.isArray())rows.forEach(result::add);else result.add(rows);
    }
    return result;
  }
  public BigDecimal quote(Account a,String exchange,String symbol) {
    boolean kr="KRX".equals(exchange);
    var p=kr?Map.of("FID_COND_MRKT_DIV_CODE","J","FID_INPUT_ISCD",symbol)
        :Map.of("AUTH","","EXCD",Objects.requireNonNull(KisClient.quoteExchange(exchange)),"SYMB",symbol);
    var rows=get(a,kr?"/uapi/domestic-stock/v1/quotations/inquire-price":"/uapi/overseas-price/v1/quotations/price",
        kr?"FHKST01010100":"HHDFS00000300",p,null,"output");
    check(rows.size()==1,"현재가 조회 결과를 확인해주세요.");
    var price=KisClient.number(rows.getFirst(),kr?"stck_prpr":"last");
    check(price.signum()>0,"현재가를 조회할 수 없습니다.");return price;
  }
  public JsonNode submit(Account a,StockOrder o) {
    var p=base(a);boolean kr="KRX".equals(o.getExchange()),buy="BUY".equals(o.getSide());
    p.put("PDNO",o.getSymbol());p.put("ORD_QTY",o.getQuantity().toBigIntegerExact().toString());
    p.put("ORD_DVSN","MARKET".equals(o.getOrderType())?"01":"00");
    if(kr) {
      p.put("ORD_UNPR",o.getPrice().toBigIntegerExact().toString());p.put("EXCG_ID_DVSN_CD","KRX");p.put("SLL_TYPE",buy?"":"01");
      return client.tradingPost(a,"/uapi/domestic-stock/v1/trading/order-cash",tr(o,buy?"TTTC0012U":"TTTC0011U",buy?"VTTC0012U":"VTTC0011U"),p);
    }
    check(!"MARKET".equals(o.getOrderType()),"미국 주식은 지정가 또는 현재가 지정가를 사용해주세요.");
    p.put("OVRS_EXCG_CD",o.getExchange());p.put("OVRS_ORD_UNPR",o.getPrice().toPlainString());
    p.put("CTAC_TLNO","");p.put("MGCO_APTM_ODNO","");p.put("ORD_SVR_DVSN_CD","0");p.put("SLL_TYPE",buy?"":"00");
    return client.tradingPost(a,"/uapi/overseas-stock/v1/trading/order",tr(o,buy?"TTTT1002U":"TTTT1006U",buy?"VTTT1002U":"VTTT1001U"),p);
  }
  private List<JsonNode> orderRows(Account a,StockOrder o) {
    var p=base(a);boolean kr="KRX".equals(o.getExchange());List<JsonNode> rows;
    if(kr) {
      p.putAll(Map.of("INQR_STRT_DT",o.getOrderDate().format(DAY),"INQR_END_DT",o.getOrderDate().format(DAY),
          "SLL_BUY_DVSN_CD","00","PDNO",o.getSymbol(),"CCLD_DVSN","00","INQR_DVSN","00","INQR_DVSN_3","00","ORD_GNO_BRNO","","ODNO",Objects.toString(o.getBrokerOrderId(),""),"INQR_DVSN_1",""));
      p.put("CTX_AREA_FK100","");p.put("CTX_AREA_NK100","");p.put("EXCG_ID_DVSN_CD","KRX");
      boolean old=o.getOrderDate().isBefore(LocalDate.now(ZoneId.of("Asia/Seoul")).minusMonths(3));
      rows=get(a,"/uapi/domestic-stock/v1/trading/inquire-daily-ccld",tr(o,old?"CTSC9215R":"TTTC0081R",old?"VTSC9215R":"VTTC0081R"),p,"100","output1");
    } else {
      boolean demo="DEMO".equals(o.getEnvironment());
      p.putAll(Map.of("PDNO",demo?"":o.getSymbol(),"ORD_STRT_DT",o.getOrderDate().format(DAY),"ORD_END_DT",o.getOrderDate().format(DAY),
          "SLL_BUY_DVSN","00","CCLD_NCCS_DVSN","00","OVRS_EXCG_CD",demo?"":o.getExchange(),"SORT_SQN","DS","ORD_DT","","ORD_GNO_BRNO","","ODNO",""));
      p.put("CTX_AREA_FK200","");p.put("CTX_AREA_NK200","");
      rows=get(a,"/uapi/overseas-stock/v1/trading/inquire-ccnl",tr(o,"TTTS3035R","VTTS3035R"),p,"200","output");
    }
    return rows;
  }
  public record Candidate(String brokerOrderId,String orderDate,String orderTime,String symbol,String side,
                          BigDecimal quantity,BigDecimal price,String exchange) {}
  public List<Candidate> candidates(Account a,StockOrder o) {
    boolean kr="KRX".equals(o.getExchange());
    var result=new LinkedHashMap<String,Candidate>();
    for(var r:orderRows(a,o)) {
      if(!r.path("pdno").asText().equals(o.getSymbol())||!r.path("ord_dt").asText().equals(o.getOrderDate().format(DAY)))continue;
      if(!("BUY".equals(o.getSide())?"02":"01").equals(r.path("sll_buy_dvsn_cd").asText()))continue;
      if(!kr&&!o.getExchange().equals(r.path("ovrs_excg_cd").asText()))continue;
      var quantity=KisClient.number(r,kr?"ord_qty":"ft_ord_qty");
      var price=KisClient.number(r,kr?"ord_unpr":"ft_ord_unpr3");
      if(quantity.compareTo(o.getQuantity())!=0||price.compareTo(o.getPrice())!=0)continue;
      String id=r.path("odno").asText();check(id.matches("[0-9]{1,40}"),"조회 결과의 주문번호를 확인할 수 없습니다.");
      id=id.replaceFirst("^0+(?!$)","");
      result.putIfAbsent(id,new Candidate(id,r.path("ord_dt").asText(),r.path("ord_tmd").asText(),o.getSymbol(),o.getSide(),quantity,price,o.getExchange()));
    }
    return List.copyOf(result.values());
  }
  public JsonNode lookup(Account a,StockOrder o) {
    boolean kr="KRX".equals(o.getExchange());
    var found=orderRows(a,o).stream().filter(r->sameNumber(r.path("odno").asText(),o.getBrokerOrderId())
        && r.path("pdno").asText().equals(o.getSymbol()) && r.path("ord_dt").asText().equals(o.getOrderDate().format(DAY)))
        .toList();
    check(found.size()<=1,"동일 주문번호의 조회 결과가 여러 건입니다.");
    if(found.isEmpty())return null;
    var r=found.getFirst();
    check(("BUY".equals(o.getSide())?"02":"01").equals(r.path("sll_buy_dvsn_cd").asText())
        && KisClient.number(r,kr?"ord_qty":"ft_ord_qty").compareTo(o.getQuantity())==0,"조회한 주문의 방향·수량이 다릅니다.");
    if(!kr)check(o.getExchange().equals(r.path("ovrs_excg_cd").asText()),"조회한 주문의 거래소가 다릅니다.");
    check(KisClient.number(r,kr?"ord_unpr":"ft_ord_unpr3").compareTo(o.getPrice())==0,"조회한 주문의 가격이 다릅니다.");
    return r;
  }
  static boolean sameNumber(String a,String b) {
    return a!=null&&b!=null&&!a.isBlank()&&!b.isBlank()&&a.replaceFirst("^0+(?!$)","").equals(b.replaceFirst("^0+(?!$)",""));
  }
  public BigDecimal cancelable(Account a,StockOrder o) {
    // Demo does not provide the live-only cancelable-order query. Use the fresh order inquiry.
    if("DEMO".equals(o.getEnvironment()))return o.getRemainingQuantity();
    var p=base(a);boolean kr="KRX".equals(o.getExchange());
    if(kr)p.putAll(Map.of("INQR_DVSN_1","0","INQR_DVSN_2","0","CTX_AREA_FK100","","CTX_AREA_NK100",""));
    else p.putAll(Map.of("OVRS_EXCG_CD",o.getExchange(),"SORT_SQN","DS","CTX_AREA_FK200","","CTX_AREA_NK200",""));
    var rows=get(a,kr?"/uapi/domestic-stock/v1/trading/inquire-psbl-rvsecncl":"/uapi/overseas-stock/v1/trading/inquire-nccs",
        kr?"TTTC0084R":"TTTS3018R",p,kr?"100":"200","output");
    var found=rows.stream().filter(r->sameNumber(r.path("odno").asText(),o.getBrokerOrderId())&&o.getSymbol().equals(r.path("pdno").asText())).toList();
    check(found.size()==1,"취소 가능한 주문을 찾을 수 없습니다. 체결 상태를 다시 조회해주세요.");
    return KisClient.number(found.getFirst(),kr?"psbl_qty":"nccs_qty");
  }
  public JsonNode cancel(Account a,StockOrder o,BigDecimal quantity) {
    var p=base(a);boolean kr="KRX".equals(o.getExchange());
    p.put("ORGN_ODNO",o.getBrokerOrderId());p.put("RVSE_CNCL_DVSN_CD","02");p.put("ORD_QTY",quantity.toBigIntegerExact().toString());
    if(kr) {
      check(o.getBrokerBranch()!=null&&!o.getBrokerBranch().isBlank(),"주문조직번호가 없습니다.");
      p.put("KRX_FWDG_ORD_ORGNO",o.getBrokerBranch());p.put("ORD_DVSN","MARKET".equals(o.getOrderType())?"01":"00");
      p.put("ORD_UNPR","0");p.put("QTY_ALL_ORD_YN","Y");p.put("EXCG_ID_DVSN_CD","KRX");
    } else {
      p.put("PDNO",o.getSymbol());p.put("OVRS_EXCG_CD",o.getExchange());p.put("OVRS_ORD_UNPR","0");p.put("MGCO_APTM_ODNO","");p.put("ORD_SVR_DVSN_CD","0");
    }
    return client.tradingPost(a,kr?"/uapi/domestic-stock/v1/trading/order-rvsecncl":"/uapi/overseas-stock/v1/trading/order-rvsecncl",
        kr?tr(o,"TTTC0013U","VTTC0013U"):tr(o,"TTTT1004U","VTTT1004U"),p);
  }
}
