// The server stores an immutable preview. Confirm sends only that preview's ID.
const stockOrderStatuses={PREVIEW:"전송 전",SENDING:"전송 중 / 결과 확인 필요",ACCEPTED:"접수",PARTIAL:"부분 체결",FILLED:"전량 체결",REJECTED:"거절",UNKNOWN:"결과 확인 필요",CANCEL_SENDING:"취소 요청 중",CANCEL_PENDING:"취소 접수",CANCEL_UNKNOWN:"취소 결과 확인 필요",CANCELLED:"잔량 취소 완료"};
const stockOrderTypes={LIMIT:"지정가",CURRENT:"현재가 지정가",MARKET:"시장가"};
const orderCurrency=o=>o.exchange==="KRX"?"KRW":"USD";
let stockOrderReload=async()=>{};
function stockOrderProgress(step) {
  return `<ol class="order-progress" aria-label="주문 진행 단계">${["주문 입력","최종 확인","주문 결과"].map((text,i)=>`<li ${i===step?'aria-current="step"':''}>${i+1}. ${text}</li>`).join("")}</ol>`;
}
function stockOrderBadge(o) {
  const tone=["UNKNOWN","CANCEL_UNKNOWN","SENDING"].includes(o.status)?"warning":o.status==="REJECTED"?"error":o.status==="FILLED"?"success":["ACCEPTED","PARTIAL"].includes(o.status)?"info":"neutral";
  return statusBadge(stockOrderStatuses[o.status]||o.status,tone);
}
async function bindStockOrders() {
  const owner=state.owner,container=$("#stock-order-list");
  const settings=await api("/securities/orders/settings");
  if(container!==$("#stock-order-list")||owner!==state.owner)return;
  $("#stock-order-settings").textContent=(settings.environment==="REAL"?"실전 투자":settings.environment==="DEMO"?"모의 투자":"서버 설정 확인 필요")+" · "+(settings.enabled?"주문 가능":"주문 비활성화 (kis.trading-enabled 설정)");
  $("#stock-order-new").disabled=!settings.enabled;
  $("#stock-order-new").onclick=()=>stockOrderForm();
  let rows=[],page=0;
  const draw=()=>{
    page=Math.max(0,Math.min(page,Math.ceil(rows.length/15)-1));
    container.innerHTML=rows.length?table(["신청일 / 환경","계좌","종목 / 거래소","방향 / 방식","수량 / 가격","체결 / 잔량","상태 / KIS 주문번호","확인"],rows.slice(page*15,page*15+15).map(o=>[
      esc(new Date(o.createdAt).toLocaleString("ko-KR"))+" / "+(o.environment==="REAL"?"실전":"모의"),esc(o.accountName),esc(o.symbol)+" / "+esc(o.exchange),
      (o.side==="BUY"?"매수":"매도")+" / "+esc(stockOrderTypes[o.orderType]),fmt(o.quantity)+"주 / "+(o.orderType==="MARKET"?"시장가":money(o.price,orderCurrency(o))),
      fmt(o.filledQuantity)+" / "+fmt(o.remainingQuantity),stockOrderBadge(o)+"<br>"+esc(o.brokerOrderId||"미확인"),
      `<button type="button" data-order-detail="${esc(o.id)}">상세 / 체결 조회</button>`])):emptyState("아직 전송한 주문이 없습니다.","보유 종목명이나 매수 / 매도 버튼으로 주문을 시작하세요. 최종 확인 전에는 주문이 전송되지 않습니다.");
    $("#stock-order-page").textContent=`${page+1} / ${Math.max(1,Math.ceil(rows.length/15))} 페이지 · ${rows.length}건`;
    $("#stock-order-prev").disabled=page===0;$("#stock-order-next").disabled=(page+1)*15>=rows.length;
    $$("[data-order-detail]",container).forEach(b=>b.onclick=run(async()=>stockOrderDetail(await api("/securities/orders/"+b.dataset.orderDetail))));
  };
  let request=0;
  stockOrderReload=async()=>{
    const current=++request,result=await api("/securities/orders?owner="+owner);
    if(current!==request||owner!==state.owner||container!==$("#stock-order-list"))return;
    rows=result;draw();
  };
  $("#stock-order-reload").onclick=run(stockOrderReload);
  $("#stock-order-prev").onclick=()=>{page--;draw();};$("#stock-order-next").onclick=()=>{page++;draw();};
  await stockOrderReload();
}
async function stockOrderFromHolding(symbol,currency,accountId) {
  const owner=state.owner;
  const [settings,holdings]=await Promise.all([api("/securities/orders/settings"),api("/securities/holdings?"+(accountId?"account="+encodeURIComponent(accountId):"owner="+owner))]);
  if(owner!==state.owner)return;
  if(!settings.enabled){modal("주식 주문",'<p>주문 기능이 비활성화되어 있습니다. KIS 연결과 주문 활성화 설정을 확인해주세요.</p>',null);return;}
  const eligible=own(state.accounts).filter(a=>a.assetType==="SECURITIES"&&a.status==="ACTIVE"&&a.kisLinked);
  const matched=holdings.filter(h=>h.symbol===symbol&&h.currencyCode===currency&&decimal(h.quantity)>0n&&(!accountId||eq(h.accountId,accountId))&&eligible.some(a=>eq(a.id,h.accountId)));
  if(!matched.length){modal("주식 주문",'<p>주문 가능한 연결 계좌에서 해당 보유종목을 찾을 수 없습니다. 자산을 갱신한 뒤 다시 확인해주세요.</p>',null);return;}
  stockOrderForm({symbol,currency,holdings:matched});
}
function holdingOrderExchange(h) {
  if(!h)return "";
  if(h.currencyCode==="KRW")return "KRX";
  return ({NAS:"NASD",NASD:"NASD",NYS:"NYSE",NYSE:"NYSE",AMS:"AMEX",AMEX:"AMEX"})[h.exchangeCode]||"";
}
function stockOrderForm(preset=null,draft=null) {
  const accounts=own(state.accounts).filter(a=>a.assetType==="SECURITIES"&&a.status==="ACTIVE"&&a.kisLinked&&(!preset||preset.holdings.some(h=>eq(h.accountId,a.id))));
  if(!accounts.length){notice("KIS 연결 증권계좌를 먼저 등록해주세요.",true);return;}
  modal("주식 매수 / 매도",stockOrderProgress(0)+`<div id="stock-order-form"><div class="form-grid">
    <label>계좌<select name="accountId" required>${preset&&accounts.length>1?'<option value="">주문할 보유 계좌 선택</option>':''}${accounts.map(a=>`<option value="${a.id}">${esc(a.accountName)} · ${esc(a.accountNumber)}</option>`).join("")}</select></label>
    <label>거래소<select name="exchange"><option value="KRX">국내 KRX</option><option value="NASD">미국 NASDAQ</option><option value="NYSE">미국 NYSE</option><option value="AMEX">미국 AMEX</option></select></label>
    <label>종목코드<input name="symbol" required maxlength="20" placeholder="005930 / AAPL"></label>
    <label>주문 방향<select name="side"><option value="BUY">매수 · 수량 늘리기</option><option value="SELL">매도 · 수량 줄이기</option></select></label>
    <label>방식<select name="orderType"><option value="LIMIT">지정가</option><option value="CURRENT">현재가 지정가</option><option value="MARKET">시장가 (국내)</option></select></label>
    <label>수량 (주)<input name="quantity" type="number" min="1" max="999999999" step="1" value="1" required></label>
    <label id="stock-order-price-label">지정가 <span id="stock-order-unit">KRW</span><input name="price" type="number" min="1" step="1" required></label>
    </div><p id="stock-order-holding" class="order-callout" hidden></p><p id="stock-order-explanation" class="order-callout"></p>
    <div class="order-actions"><button type="button" id="stock-order-preview" class="primary">가격 조회 및 주문 확인</button></div></div>`,null);
  const form=$("#stock-order-form"),f=Object.fromEntries($$("[name]",form).map(e=>[e.name,e]));
  const change=()=>{
    const kr=f.exchange.value==="KRX";
    f.orderType.querySelector('option[value="MARKET"]').disabled=!kr;
    if(!kr&&f.orderType.value==="MARKET")f.orderType.value="CURRENT";
    f.price.disabled=f.orderType.value!=="LIMIT";f.price.required=!f.price.disabled;
    $("#stock-order-price-label").hidden=f.price.disabled;$("#stock-order-unit").textContent=kr?"KRW":"USD";
    f.price.min=kr?"1":"0.0001";f.price.step=kr?"1":"0.0001";
    $("#stock-order-explanation").textContent=({LIMIT:"입력한 가격으로 주문합니다. 해당 가격에 거래 상대가 없으면 미체결될 수 있습니다.",CURRENT:"지금 조회한 현재가를 지정가로 사용합니다. 시세가 바뀌면 미체결될 수 있습니다.",MARKET:"국내 시장가로 주문합니다. 실제 체결 가격은 화면의 예상 가격과 다를 수 있습니다."})[f.orderType.value]+" 다음 화면에서 계좌·방향·수량·금액을 확인합니다.";
  };
  f.exchange.onchange=change;f.orderType.onchange=change;
  if(preset) {
    f.symbol.value=preset.symbol;f.symbol.readOnly=true;f.orderType.value="CURRENT";
    f.accountId.disabled=accounts.length===1;
    f.exchange.insertAdjacentHTML("afterbegin",'<option value="">거래소 확인 후 선택</option>');f.exchange.required=true;
    // A missing historical exchange must never silently default to NASDAQ.
    for(const option of f.exchange.options)if(option.value)option.disabled=preset.currency==="KRW"?option.value!=="KRX":option.value==="KRX";
    const selectAccount=()=>{
      const h=preset.holdings.find(h=>eq(h.accountId,f.accountId.value)),exchange=holdingOrderExchange(h);
      f.exchange.value=exchange;f.exchange.disabled=!!exchange||!h;
      const hint=$("#stock-order-holding");hint.hidden=false;
      hint.textContent=h?`${h.name||h.symbol} · 저장된 보유 수량 ${fmt(h.quantity)}주. 실제 매도 가능 수량은 미체결 주문 등에 따라 달라질 수 있습니다.${exchange?"":" 거래소 정보가 없어 직접 확인 후 선택해주세요."}`:"해당 종목을 보유한 계좌 중 주문할 계좌를 선택해주세요.";
      f.quantity.value="1";f.price.value="";change();
    };
    f.accountId.onchange=selectAccount;selectAccount();
  }
  if(draft) {
    f.accountId.value=String(draft.accountId);
    if(preset)f.accountId.onchange();
    for(const name of ["exchange","symbol","side","orderType"])
      if(!f[name].disabled&&!f[name].readOnly&&draft[name]!=null)f[name].value=String(draft[name]);
    change();
    for(const name of ["quantity","price"])if(!f[name].disabled&&draft[name]!=null)f[name].value=String(draft[name]);
  }
  change();
  $("#stock-order-preview").onclick=async()=>{
    if(Object.values(f).some(e=>!e.reportValidity()))return;
    const b=$("#stock-order-preview");if(b.disabled)return;b.disabled=true;b.textContent="가격 확인 중…";$("#modal-error").textContent="";
    try {
      const request={accountId:Number(f.accountId.value),exchange:f.exchange.value,symbol:f.symbol.value.trim().toUpperCase(),side:f.side.value,orderType:f.orderType.value,quantity:f.quantity.value,price:f.price.disabled?null:f.price.value};
      const o=await api("/securities/orders/preview","POST",request);
      if(form.isConnected&&$("#modal").open)stockOrderConfirm(o,()=>stockOrderForm(preset,request));
    } catch(err) {if(form.isConnected&&$("#modal").open){$("#modal-error").textContent=err.message;$("#modal-error").focus();b.disabled=false;b.textContent="가격 조회 및 주문 확인";}}
  };
}
function stockOrderSummary(o) {
  return detailGrid({"환경":o.environment==="REAL"?"실전 투자 · 실제 주문":"모의 투자","계좌":o.accountName,"종목 / 거래소":o.symbol+" / "+o.exchange,
    "매수 / 매도":o.side==="BUY"?"매수":"매도","주문 방식":stockOrderTypes[o.orderType],"수량":fmt(o.quantity)+"주",
    "주문 가격":o.orderType==="MARKET"?"시장가 · 체결 시 결정":money(o.price,orderCurrency(o)),
    "조회 현재가":money(o.quotePrice,orderCurrency(o)),"조회 시각":new Date(o.quotedAt).toLocaleString("ko-KR"),
    "예상 금액 (수수료·세금 제외)":money(mul(o.quantity,o.orderType==="MARKET"?o.quotePrice:o.price),orderCurrency(o))});
}
function stockOrderConfirm(o,onEdit=null) {
  modal("주문 최종 확인",stockOrderProgress(1)+stockOrderSummary(o)+`<p class="order-callout">${o.orderType==="MARKET"?"실제 체결 가격과 금액은 예상과 달라질 수 있습니다.":"표시된 가격으로 지정가 주문합니다. 현재가가 변하면 미체결될 수 있습니다."} 예상 금액에 수수료·세금은 포함되지 않습니다.</p><p class="muted">확인 유효시간: ${esc(new Date(o.expiresAt).toLocaleTimeString("ko-KR"))} · 시간이 지나면 가격을 다시 조회해주세요.</p><div class="order-actions">${onEdit?'<button type="button" id="stock-order-edit">주문 내용 수정</button>':''}<button type="button" id="stock-order-send" class="primary">${o.environment==="REAL"?"실제":"모의"} ${o.side==="BUY"?"매수":"매도"} 주문 전송</button></div>`,null);
  if(onEdit)$("#stock-order-edit").onclick=onEdit;
  $("#stock-order-send").onclick=async()=>{
    const b=$("#stock-order-send");if(b.disabled)return;
    if(Date.now()>=new Date(o.expiresAt).getTime()) {b.disabled=true;$("#modal-error").textContent="확인 시간이 만료되었습니다. 주문 내용을 수정하고 가격을 다시 조회해주세요.";$("#modal-error").focus();return;}
    b.disabled=true;b.textContent="주문 결과 확인 중…";if(onEdit)$("#stock-order-edit").disabled=true;
    try {const result=await api("/securities/orders/"+o.id+"/confirm","POST",{});if(b.isConnected&&$("#modal").open)stockOrderDetail(result);await stockOrderReload();}
    catch(err) {
      // Do not offer a resend after a disconnected request. Read the durable state instead.
      try {const result=await api("/securities/orders/"+o.id);if(b.isConnected&&$("#modal").open)stockOrderDetail(result);await stockOrderReload();}
      catch {if(b.isConnected&&$("#modal").open)$("#modal-error").textContent="주문 응답을 확인할 수 없습니다. 재전송하지 말고 주문 내역을 새로고침해주세요.";}
      notice(err.message,true);
    }
  };
}
function stockOrderDetail(o) {
  modal("주문 상세",stockOrderProgress(2)+`<p>${stockOrderBadge(o)}</p>`+stockOrderSummary(o)+detailGrid({"상태":stockOrderStatuses[o.status],"KIS 주문번호":o.brokerOrderId||"미확인","체결 수량":fmt(o.filledQuantity),"미체결 수량":fmt(o.remainingQuantity),"체결 평균가":o.averageFillPrice==null?"—":money(o.averageFillPrice,orderCurrency(o)),"안내":o.message})+
    (o.brokerOrderId?'<button type="button" id="stock-order-sync">체결 조회</button>':'')+
    (["ACCEPTED","PARTIAL"].includes(o.status)?'<button type="button" id="stock-order-cancel">미체결 잔량 취소</button>':'')+
    (!o.brokerOrderId&&["UNKNOWN","SENDING"].includes(o.status)?'<p>먼저 KIS 앱에서 주문을 확인해주세요. 주문번호를 연결하면 날짜·종목·방향·수량·가격을 대조합니다.</p><label>KIS 주문번호<input id="stock-order-broker-id" inputmode="numeric"></label><button type="button" id="stock-order-link">주문번호 연결 및 조회</button>':''),null);
  const bind=(selector,action,body)=>{const b=$(selector);if(b)b.onclick=async()=>{
    if(b.disabled)return;b.disabled=true;
    try {stockOrderDetail(await api("/securities/orders/"+o.id+"/"+action,"POST",body?body():{}));await stockOrderReload();}
    catch(e){$("#modal-error").textContent=e.message;b.disabled=false;}
  };};
  bind("#stock-order-sync","sync");bind("#stock-order-link","link",()=>({brokerOrderId:$("#stock-order-broker-id").value.trim()}));
  const cancel=$("#stock-order-cancel");if(cancel)cancel.onclick=()=>{
    modal("미체결 잔량 취소 확인",`<p>${esc(o.accountName)} · ${esc(o.symbol)}의 미체결 잔량을 취소 요청합니다. 이미 체결된 수량은 취소되지 않습니다.</p><button type="button" id="stock-order-cancel-confirm">잔량 취소 요청</button>`,null);
    const b=$("#stock-order-cancel-confirm");b.onclick=async()=>{
      if(b.disabled)return;b.disabled=true;
      try{stockOrderDetail(await api("/securities/orders/"+o.id+"/cancel","POST",{}));await stockOrderReload();}
      catch(e){$("#modal-error").textContent=e.message+" · 취소 결과는 주문 내역에서 체결 조회로 확인해주세요.";}
    };
  };
}
