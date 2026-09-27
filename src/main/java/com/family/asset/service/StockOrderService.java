package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.kis.*;
import com.family.asset.mapper.StockOrderMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.JsonNode;

@Service
@RequiredArgsConstructor
// Claims must commit BEFORE any broker mutation, even if a caller has a transaction.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public class StockOrderService {
  private final StockOrderMapper orders;
  private final CatalogService catalog;
  private final KisProperties config;
  private final KisOrderClient broker;

  private String environment() {
    return switch(config.getBaseUrl().replaceAll("/+$", "")) {
      case "https://openapi.koreainvestment.com:9443" -> "REAL";
      case "https://openapivts.koreainvestment.com:29443" -> "DEMO";
      default -> "UNSUPPORTED";
    };
  }
  public Map<String,Object> settings() {
    return Map.of("enabled",config.isEnabled()&&config.isTradingEnabled()&&!environment().equals("UNSUPPORTED"),"environment",environment());
  }
  private Account account(Long id,boolean sending) {
    check(config.isEnabled(),"KIS 연결이 비활성화되어 있습니다.");
    if(sending)check(config.isTradingEnabled(),"주문 기능을 사용하려면 kis.trading-enabled 설정을 활성화해주세요.");
    check(!environment().equals("UNSUPPORTED"),"KIS 주문 서버 주소를 확인해주세요.");
    var a=sending?catalog.activeAccount(id):catalog.account(id);
    check(a.getAssetType()==AssetType.SECURITIES&&Boolean.TRUE.equals(a.getKisLinked()),"KIS 연결 증권계좌만 주문할 수 있습니다.");
    check(a.getAccountNumber().replaceAll("[^0-9]", "").length()==10,"KIS 계좌번호를 확인해주세요.");
    var c=config.credentials(id);
    check(!c.getAppKey().isBlank()&&!c.getAppSecret().isBlank(),"계좌의 KIS 인증 설정을 확인해주세요.");
    return a;
  }
  private String binding(Account a) {
    try {
      var value=environment()+"|"+a.getAccountNumber().replaceAll("[^0-9]", "")+"|"+a.getOwnerCode()+"|"+config.credentials(a.getId()).getAppKey();
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch(java.security.NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
  }
  private Account bound(StockOrder o,boolean sending) {
    var a=account(o.getAccountId(),sending);
    check(binding(a).equals(o.getAccountBinding()),"주문 이후 계좌 또는 KIS 접속 설정이 변경되었습니다. 원래 설정으로 조회해주세요.");
    return a;
  }
  private LocalDate day(String exchange) {return LocalDate.now(ZoneId.of(exchange.equals("KRX")?"Asia/Seoul":"America/New_York"));}
  public StockOrder find(String id) {return require(orders.find(id),"주문");}
  public List<StockOrder> list(OwnerCode owner) {return orders.list(owner.name());}
  public StockOrder preview(StockOrderRequest r) {
    var a=account(r.accountId(),true);
    check(orders.unresolved(a.getId())==0,"결과 확인이 필요한 주문이 있습니다. 기존 주문을 먼저 확인해주세요.");
    boolean kr=r.exchange().equals("KRX"),market=r.orderType().equals("MARKET");
    check(kr||!market,"미국 주식은 지정가 또는 현재가 지정가를 사용해주세요.");
    if(kr)check(r.symbol().matches("[0-9]{6}"),"국내 종목코드는 6자리 숫자입니다.");
    var quote=broker.quote(a,r.exchange(),r.symbol());
    var price=market?BigDecimal.ZERO:r.orderType().equals("CURRENT")?quote:require(r.price(),"지정가");
    check(market||price.signum()>0,"주문 가격은 0보다 커야 합니다.");
    check(price.stripTrailingZeros().scale()<=(kr?0:4),kr?"국내 주문 가격은 원 단위로 입력해주세요.":"미국 주문 가격은 소수점 4자리까지 지원합니다.");
    var o=new StockOrder();o.setId(UUID.randomUUID().toString());o.setAccountId(a.getId());o.setAccountName(a.getAccountName());
    o.setOwnerCode(a.getOwnerCode().name());o.setAccountBinding(binding(a));o.setEnvironment(environment());
    o.setExchange(r.exchange());o.setSymbol(r.symbol());o.setSide(r.side());o.setOrderType(r.orderType());o.setQuantity(r.quantity());
    o.setPrice(price);o.setQuotePrice(quote);o.setQuotedAt(OffsetDateTime.now());o.setExpiresAt(o.getQuotedAt().plusSeconds(120));o.setOrderDate(day(r.exchange()));
    orders.insert(o);return find(o.getId());
  }
  public StockOrder confirm(String id) {
    var o=find(id);
    if(!o.getStatus().equals("PREVIEW"))return o; // replay returns the original result, never resends
    var a=bound(o,true);
    check(o.getExpiresAt().isAfter(OffsetDateTime.now())&&day(o.getExchange()).equals(o.getOrderDate()),"주문 확인 시간이 만료되었습니다. 가격을 다시 확인해주세요.");
    check(orders.unresolved(a.getId())==0,"결과 확인이 필요한 주문을 먼저 확인해주세요.");
    if(orders.claimSubmit(id,o.getVersion())==0) {
      var current=find(id);check(!current.getStatus().equals("PREVIEW"),"주문 확인 시간이 만료되었습니다.");return current;
    }
    o=find(id);
    try { applyResponse(o,broker.submit(a,o),false); }
    catch(Exception e) {o.setStatus("UNKNOWN");o.setMessage("주문 결과 확인 필요 · 자동 재전송하지 않습니다. KIS 주문내역에서 확인 후 주문번호를 연결해주세요.");}
    orders.update(o);return find(id);
  }
  private String value(JsonNode node,String key) {
    var v=node.path(key);return v.isMissingNode()?node.path(key.toUpperCase(Locale.ROOT)).asText(""):v.asText("");
  }
  private void applyResponse(StockOrder o,JsonNode body,boolean cancel) {
    check(body!=null,"KIS 응답이 없습니다.");
    var code=value(body,"rt_cd");
    if(code.equals("1")) {
      o.setStatus(cancel?(o.getFilledQuantity().signum()>0?"PARTIAL":"ACCEPTED"):"REJECTED");
      if(!cancel)o.setRemainingQuantity(BigDecimal.ZERO);
      String msg=value(body,"msg1");o.setMessage((cancel?"취소 거절: ":"주문 거절: ")+msg.substring(0,Math.min(msg.length(),450)));return;
    }
    check(code.equals("0"),"KIS 주문 결과를 확인할 수 없습니다.");
    var output=body.path("output");var id=value(output,"odno");check(id.matches("[0-9]{1,40}"),"주문번호가 없습니다.");
    // Canonical form prevents the same broker order being linked with different leading zeros.
    id=id.replaceFirst("^0+(?!$)", "");
    if(cancel)o.setCancelOrderId(id);
    else {o.setBrokerOrderId(id);o.setBrokerBranch(value(output,"krx_fwdg_ord_orgno"));}
    o.setStatus(cancel?"CANCEL_PENDING":"ACCEPTED");o.setMessage(cancel?"취소 접수 · 최종 취소 여부는 체결 조회로 확인해주세요.":"주문 접수 · 아직 체결을 의미하지 않습니다.");
  }
  private BigDecimal number(JsonNode row,String key) {
    var v=value(row,key);check(!v.isBlank(),"KIS 체결 수량이 누락되었습니다.");return new BigDecimal(v.replace(",",""));
  }
  private void applyInquiry(StockOrder o,JsonNode row) {
    boolean kr=o.getExchange().equals("KRX");
    var filled=number(row,kr?"tot_ccld_qty":"ft_ccld_qty");
    var remaining=number(row,kr?"rmn_qty":"nccs_qty");
    check(filled.signum()>=0&&remaining.signum()>=0&&filled.add(remaining).compareTo(o.getQuantity())<=0,"KIS 체결 수량을 확인해주세요.");
    check(filled.compareTo(o.getFilledQuantity())>=0,"이전보다 오래된 체결 응답입니다. 다시 조회해주세요.");
    check(remaining.compareTo(o.getRemainingQuantity())<=0,"이전보다 오래된 미체결 응답입니다. 다시 조회해주세요.");
    boolean cancelled=kr?value(row,"cncl_yn").equals("Y"):value(row,"prcs_stat_name").contains("취소");
    String rejection=value(row,kr?"rjct_qty":"rjct_rson");
    boolean rejected=kr?(!rejection.isBlank()&&new BigDecimal(rejection).compareTo(o.getQuantity())==0):!rejection.isBlank()&&!rejection.matches("0+");
    o.setFilledQuantity(filled);o.setRemainingQuantity(remaining);
    if(filled.signum()>0)o.setAverageFillPrice(number(row,kr?"avg_prvs":"ft_ccld_unpr3"));
    if(kr&&!value(row,"ord_gno_brno").isBlank())o.setBrokerBranch(value(row,"ord_gno_brno"));
    if(filled.compareTo(o.getQuantity())==0)o.setStatus("FILLED");
    else if(cancelled&&remaining.signum()==0)o.setStatus("CANCELLED");
    else if(rejected&&filled.signum()==0&&remaining.signum()==0)o.setStatus("REJECTED");
    else if(!o.getStatus().startsWith("CANCEL_")&&!Set.of("CANCELLED","FILLED","REJECTED").contains(o.getStatus()))o.setStatus(filled.signum()>0?"PARTIAL":"ACCEPTED");
    o.setMessage(o.getStatus().startsWith("CANCEL_")?"취소 결과 확인 중 · 재취소하지 않습니다. KIS 주문내역도 확인해주세요.":"KIS 체결 내역 조회 완료");
  }
  public StockOrder sync(String id) {
    var o=find(id);check(o.getBrokerOrderId()!=null,"KIS 주문내역에서 주문번호를 확인해 연결해주세요. 주문을 다시 전송하지 마세요.");
    var row=broker.lookup(bound(o,false),o);
    check(row!=null,"KIS 조회 결과에 아직 주문이 없습니다. 잠시 후 다시 조회해주세요.");
    applyInquiry(o,row);orders.update(o);return find(id);
  }
  public StockOrder link(String id,String brokerId) {
    var o=find(id);check(o.getBrokerOrderId()==null&&Set.of("UNKNOWN","SENDING").contains(o.getStatus()),"주문번호 연결 대상이 아닙니다.");
    check(brokerId!=null&&brokerId.matches("[0-9]{1,40}"),"KIS 주문번호를 입력해주세요.");
    o.setBrokerOrderId(brokerId.replaceFirst("^0+(?!$)", ""));
    var row=broker.lookup(bound(o,false),o);check(row!=null,"해당 날짜·종목의 주문번호를 찾을 수 없습니다.");
    applyInquiry(o,row);orders.update(o);return find(id);
  }
  public StockOrder cancel(String id) {
    var o=sync(id);var a=bound(o,true);
    check(Set.of("ACCEPTED","PARTIAL").contains(o.getStatus()),"현재 상태에서는 취소 요청을 할 수 없습니다.");
    var quantity=broker.cancelable(a,o);
    check(quantity.signum()>0&&quantity.compareTo(o.getRemainingQuantity())<=0,"취소 가능 수량을 확인해주세요.");
    if(o.getExchange().equals("KRX"))check(o.getBrokerBranch()!=null&&!o.getBrokerBranch().isBlank(),"주문조직번호가 없습니다.");
    if(orders.claimCancel(id,o.getVersion())==0)return find(id);
    o=find(id);
    try {applyResponse(o,broker.cancel(a,o,quantity),true);}
    catch(Exception e) {o.setStatus("CANCEL_UNKNOWN");o.setMessage("취소 결과 확인 필요 · 자동 재전송하지 않습니다.");}
    orders.update(o);return find(id);
  }
}
