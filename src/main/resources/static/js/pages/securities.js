// pages/securities.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
// 컬럼 정의를 통합/계좌 상세에서 공유해 평단가와 수익률 표시 기준이 달라지지 않도록 한다.
// 수익률은 현지 통화 평가손익 / 매입원가이며 환율 변동 손익은 포함하지 않는다.
// 통화 변환 기준은 계좌/종목에 저장된 환율이다. KRW 종목의 exchangeRate=1은 KRW→KRW이므로 USD 환율로 쓰지 않는다.
function accountFx(a) { return a?.lastSyncedAt && decimal(a.exchangeRate)>0n && decimal(a.exchangeRate)!==decimal("1") ? a.exchangeRate : null; }
function usdValue(h, native) {
  if((h.currencyCode||h.currency)==="USD") return native;
  const rate=accountFx(acc(h.accountId)); return rate ? div(native,rate) : null;
}
function nullableSum(values) { return values.some(v=>v===null) ? null : sum(values); }
function dualAmount(won, dollars, nativeCurrency = "KRW") {
  return `<span class="dual-money"><b>${krw(won)}</b><small>${dollars===null ? "USD 환율 미확인" : "USD $"+usdFormat(dollars)+(nativeCurrency==="USD"?"":" (환산)")}</small></span>`;
}
function dualText(won,dollars) { return krw(won)+" / "+(dollars===null?"USD 환율 미확인":"USD $"+usdFormat(dollars)+" (환산)"); }
function enrichHolding(h) {
  const cost=mul(h.averagePrice,h.quantity), currency=h.currencyCode;
  return {...h,currency,costNative:cost,costKrw:currency==="USD"?mul(cost,h.exchangeRate):cost,
    costUsd:usdValue(h,cost),valueUsd:usdValue(h,h.valueNative),
    priceKrw:currency==="USD"?mul(h.currentPrice,h.exchangeRate):h.currentPrice,
    priceUsd:usdValue(h,h.currentPrice)};
}
function enrichedPortfolio(portfolio,holdings,accounts) {
  return portfolio.map(p=>{
    if(p.symbol==="CASH") return {...p,valueUsd:nullableSum(accounts.map(a=>accountFx(a)?sum([div(a.depositKrw,accountFx(a)),a.depositUsd]):null))};
    const hh=holdings.filter(h=>h.symbol===p.symbol&&h.currencyCode===p.currency).map(enrichHolding);
    const quote=hh.filter(h=>h.dailyReturn!=null).sort((a,b)=>(b.priceFetchedAt||"").localeCompare(a.priceFetchedAt||""))[0];
    return {...p,dailyReturn:quote?.dailyReturn,priceDate:quote?.priceDate,priceFetchedAt:quote?.priceFetchedAt,exchangeCode:quote?.exchangeCode,costKrw:sum(hh.map(h=>h.costKrw)),costUsd:nullableSum(hh.map(h=>h.costUsd)),valueUsd:nullableSum(hh.map(h=>h.valueUsd)),
      priceKrw:div(p.valueKrw,p.quantity),priceUsd:hh.some(h=>h.valueUsd===null)?null:div(sum(hh.map(h=>h.valueUsd)),p.quantity)};
  });
}
function sortPortfolio(rows,metric,direction) {
  const key=h=>{
    if(metric==="value") return [decimal(h.valueKrw),1n];
    if(h.symbol==="CASH") return null;
    if(metric==="profit") return [decimal(h.valueKrw)-decimal(h.costKrw),1n];
    const cost=decimal(h.costNative??mul(h.averagePrice,h.quantity));
    if(cost===0n) return null;
    const profit=decimal(h.valueNative)-cost;
    return cost<0n?[-profit,-cost]:[profit,cost];
  };
  // 수익률은 반올림 전 비율로 비교하고, 값이 없는 예수금/수익률은 항상 마지막에 둔다.
  return [...rows].sort((a,b)=>{
    const x=key(a),y=key(b);
    if(x===null||y===null) return x===y?0:x===null?1:-1;
    const diff=x[0]*y[1]-y[0]*x[1];
    return (diff<0n?-1:diff>0n?1:0)*(direction==="asc"?1:-1);
  });
}
/** 같은 종목/통화를 통합한 가중평균과 계좌 단독 조회에서 동일한 컬럼/공식을 사용한다. */
function holdingTable(rows,total,sort) {
  const headers=["종목 / 코드","원래 통화","수량","평균매입가 KRW / USD","현재가 KRW / USD","매입금액 KRW / USD","평가금액 KRW / USD","평가손익 KRW / USD","수익률 (환율 제외)","비중","당일 등락률 (시세일 기준)"];
  let html=table(headers,rows.map(h=>{
    const cash=h.symbol==="CASH", currency=h.currencyCode||h.currency, cost=h.costNative??mul(h.averagePrice,h.quantity), profit=sub(h.valueNative,cost);
    const name=esc(h.name)+" / "+esc(h.symbol);
    const orderLink=cash?name:`<button type="button" data-action="holding-order" data-id="${esc(h.symbol)}" data-currency="${esc(currency)}" data-account="${esc(h.accountId||"")}" aria-label="${esc(h.name||h.symbol)} 매수 또는 매도">${name}</button>`;
    return [orderLink,currency==="KRW"?"KRW (원)":currency,cash?"—":fmt(h.quantity),
      cash?"—":dualAmount(div(h.costKrw,h.quantity),h.costUsd===null?null:div(h.costUsd,h.quantity),currency),
      cash?"—":dualAmount(h.priceKrw,h.priceUsd,currency),cash?"—":dualAmount(h.costKrw,h.costUsd,currency),
      dualAmount(h.valueKrw,h.valueUsd,currency),cash?"—":dualAmount(sub(h.valueKrw,h.costKrw),h.valueUsd===null||h.costUsd===null?null:sub(h.valueUsd,h.costUsd),currency),
      cash||decimal(cost)===0n?"—":pct(profit,cost)+"%",pct(h.valueKrw,total)+"%",
      cash?"—":dailyPriceCell(h)];
  }),[0,2,6,8,10]);
  if(sort) for(const [index,metric] of [[6,"value"],[7,"profit"],[8,"return"]]) {
    const active=sort.metric===metric,ascending=sort.direction==="asc";
    html=html.replace(`<th>${esc(headers[index])}</th>`,`<th aria-sort="${active?(ascending?"ascending":"descending"):"none"}"><button type="button" data-holding-sort="${metric}" aria-label="${esc(headers[index])} ${active&&!ascending?"낮은":"높은"} 순 정렬">${esc(headers[index])} ${active?(ascending?"▲":"▼"):"↕"}</button></th>`);
  }
  return html;
}
function bindHoldingSort(container,sort,onChange) {
  $$(container+" [data-holding-sort]").forEach(b=>b.onclick=()=>{
    onChange({metric:b.dataset.holdingSort,direction:sort.metric===b.dataset.holdingSort&&sort.direction==="desc"?"asc":"desc"});
  });
}
// 원형 차트의 각도만 Number로 변환한다. 금액 합계와 표의 값은 고정소수점 계산을 유지한다.
function portfolioChart(rows, total, layout) {
  if (layout === "bar") return rows.map(p => `<div class="bar-row" ${tipAttrs("조회일 "+today(),p.valueKrw,p.name+" · "+(p.valueUsd===null?"USD 환율 미확인":"USD $"+usdFormat(p.valueUsd)))}><span>${esc(p.name)}</span><div class="track"><i style="width:${Math.max(0, Math.min(100, Number(pct(p.valueKrw,total))))}%"></i></div><span>${dualAmount(p.valueKrw,p.valueUsd,p.currency)} (${pct(p.valueKrw,total)}%)</span></div>`).join("");
  if (rows.some(p => decimal(p.valueKrw) < 0n)) return '<p class="empty">음수 잔액이 포함되어 원형 비중을 표시할 수 없습니다. 막대 보기를 선택해주세요.</p>';
  const positive = rows.filter(p => decimal(p.valueKrw) > 0n);
  const denominator = sum(positive.map(p => p.valueKrw));
  if (!positive.length) return '<p class="empty">표시할 자산이 없습니다.</p>';
  let angle = -Math.PI/2;
  const palette = ["#FFE16F", "#C88C19", "#7D8060", "#EDBA88", "#B49FC4", "#84AEA0", "#D59891"];
  const slices = positive.map((p,i) => {
    const fraction = Number(decimal(p.valueKrw)*100000000n/decimal(denominator))/100000000;
    const next = angle + fraction*Math.PI*2, color = palette[i%palette.length];
    const d = `M160 160 L${160+135*Math.cos(angle)} ${160+135*Math.sin(angle)} A135 135 0 ${fraction>0.5?1:0} 1 ${160+135*Math.cos(next)} ${160+135*Math.sin(next)} Z`;
    angle=next;
    return positive.length===1 ? `<circle cx="160" cy="160" r="135" fill="${color}" ${tipAttrs("조회일 "+today(),p.valueKrw,p.name+" · "+(p.valueUsd===null?"USD 환율 미확인":"USD $"+usdFormat(p.valueUsd)))}></circle>` : `<path d="${d}" fill="${color}" stroke="white" ${tipAttrs("조회일 "+today(),p.valueKrw,p.name+" · "+(p.valueUsd===null?"USD 환율 미확인":"USD $"+usdFormat(p.valueUsd)))}></path>`;
  }).join("");
  return `<div class="pie-layout"><svg viewBox="0 0 320 320" role="img" aria-label="포트폴리오 비중 원형 차트">${slices}</svg><div class="pie-legend" role="region" aria-label="종목별 비중 목록, 가로 스크롤" tabindex="0"><ul style="--legend-rows:${Math.min(10,positive.length)}">${positive.map((p,i)=>`<li><span class="swatch" style="background:${palette[i%palette.length]}"></span><div><span class="pie-legend-name">${esc(p.name)}</span><span class="pie-legend-value">${dualAmount(p.valueKrw,p.valueUsd,p.currency)}<span>${pct(p.valueKrw,denominator)}%</span></span></div></li>`).join("")}</ul></div></div>`;
}
async function securities() {
  const [holdings, portfolio] = await Promise.all([api("/securities/holdings?owner="+state.owner), api("/securities/portfolio?owner="+state.owner)]);
  const aa=own(state.accounts).filter(a=>a.assetType==="SECURITIES");
  const total = sum(aa.map(a=>a.currentBalanceKrw));
  pageTemplate();
  bindSectionTabs();
  $("#security-overview").innerHTML=`<div><span>증권 총자산 · 저장된 잔고 기준</span><strong>${krw(total)}</strong></div><div><span>보유 종목</span><strong>${portfolio.filter(p=>p.symbol!=="CASH").length}<small>종목</small></strong></div><div><span>증권계좌</span><strong>${aa.length}<small>개</small></strong></div>`;
  $("#trend-controls").innerHTML=trendControls();
  $("#reorder").onclick=run(()=>openOrder("SECURITIES"));
  $("#new-security").onclick=()=>editAccount(null,"SECURITIES");
  const draw=()=>{
    const visible=aa.filter(a=>a.accountName.includes($("#security-search").value));
    $("#security-list").innerHTML=table(["계좌", "소유자", "예수금 KRW (원) / USD", "매입금액 KRW / USD", "평가금액 KRW / USD", "평가손익 KRW / USD", "수익률 (환율 제외)", "계좌 총평가액", "API 갱신", "관리"],visible.map(a=>{
      const hh=holdings.filter(h=>eq(h.accountId,a.id)), cost=sum(hh.map(h=>mul(mul(h.averagePrice,h.quantity),h.exchangeRate))), value=sum(hh.map(h=>h.valueKrw));
      const rate=accountFx(a), costUsd=nullableSum(hh.map(h=>usdValue(h,mul(h.averagePrice,h.quantity)))), valueUsd=nullableSum(hh.map(h=>usdValue(h,h.valueNative)));

      return [ action("security-detail",a.id,esc(a.accountName)), label("OwnerCode",a.ownerCode), krw(a.depositKrw)+" / USD $"+usdFormat(a.depositUsd), dualAmount(cost,costUsd),dualAmount(value,valueUsd),dualAmount(sub(value,cost),costUsd===null||valueUsd===null?null:sub(valueUsd,costUsd)),decimal(cost)===0n?"—":pct(sub(value,cost),cost)+"%",dualAmount(a.currentBalanceKrw,rate?div(a.currentBalanceKrw,rate):null),a.lastSyncedAt?esc(new Date(a.lastSyncedAt).toLocaleString("ko-KR")):"미갱신", action("security-detail",a.id,"종목 상세")+action("account-edit",a.id,"수정")+action("account-close",a.id,"해지")];
    }),[0,1,7,8,9]);
  };
  $("#security-search").oninput=draw; draw();
  let layout=preference("portfolio-layout","bar");
  $("#portfolio-sort").value=preference("portfolio-sort","desc");
  $("#portfolio-sort-metric").value=preference("portfolio-sort-metric","value");
  const drawPortfolio=()=>{
    const direction=$("#portfolio-sort").value;
    const rows=sortPortfolio(enrichedPortfolio(portfolio,holdings,aa),$("#portfolio-sort-metric").value,direction);
    $("#portfolio-chart").innerHTML=portfolioChart(rows,total,layout);
    const sort={metric:$("#portfolio-sort-metric").value,direction};
    const query=$("#portfolio-search").value.trim().toLocaleLowerCase();
    const visible=rows.filter(h=>!query||[h.name,h.symbol].some(v=>String(v||"").toLocaleLowerCase().includes(query)));
    $("#portfolio-results").textContent=query?`검색 결과 ${visible.length}건`:`총 ${rows.filter(h=>h.symbol!=="CASH").length}종목 · 예수금 별도 표시`;
    $("#portfolio-table").innerHTML=visible.length?holdingTable(visible,total,sort):emptyState("표시할 종목이 없습니다.",query?"검색어를 바꾸거나 지워 전체 보유 종목을 확인하세요.":"증권계좌를 등록하고 자산을 갱신하면 보유 종목이 표시됩니다.");
    bindHoldingSort("#portfolio-table",sort,next=>{
      $("#portfolio-sort-metric").value=next.metric;
      $("#portfolio-sort").value=next.direction;
      localStorage.setItem("portfolio-sort-metric",JSON.stringify(next.metric));
      localStorage.setItem("portfolio-sort",JSON.stringify(next.direction));
      drawPortfolio();
    });
    $$("[data-layout]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.layout===layout)));
  };
  $$("[data-layout]").forEach(b=>b.onclick=()=>{layout=b.dataset.layout;localStorage.setItem("portfolio-layout",JSON.stringify(layout));drawPortfolio();});
  $("#portfolio-sort").onchange=()=>{localStorage.setItem("portfolio-sort",JSON.stringify($("#portfolio-sort").value));drawPortfolio();};
  $("#portfolio-sort-metric").onchange=()=>{localStorage.setItem("portfolio-sort-metric",JSON.stringify($("#portfolio-sort-metric").value));drawPortfolio();};
  $("#portfolio-search").oninput=drawPortfolio;
  drawPortfolio();
  $("#trend-metric").value="SECURITIES";
  $("#trend-metric").closest("select").hidden=true;
  // Optional history/order failures must not discard already-rendered account holdings.
  $("#stock-order-new").disabled=true;
  const owner=state.owner;
  const section=async(selector,load)=>{
    const container=$(selector);
    try {await load();}
    catch(e) {
      if(owner!==state.owner||container!==$(selector))return;
      container.innerHTML=`<div class="empty-state" role="status"><strong>이 내역을 불러오지 못했습니다.</strong><p>${esc(e.message)}</p><button type="button" class="section-retry">다시 조회</button></div>`;
      $(".section-retry",container).onclick=async event=>{event.currentTarget.disabled=true;await section(selector,load);};
    }
  };
  await Promise.all([
    section("#trend",()=>bindTrend()),
    section("#daily-price-history",()=>bindDailyPriceHistory()),
    section("#stock-order-list",()=>bindStockOrders())
  ]);
  bindSectionTabs();
}

function dailyPercent(value) {
  const n=decimal(value),a=n<0n?-n:n,cents=(a+500000n)/1000000n;
  return (cents===0n?"":n<0n?"-":"+")+(cents/100n)+"."+String(cents%100n).padStart(2,"0")+"%";
}
function dailyPriceCell(h) {
  const detail=h.dailyReturn==null ? '미수집' : `<b>${dailyPercent(h.dailyReturn)}</b><small class="change-caption">${esc(h.priceDate)} · ${esc(h.exchangeCode||"")}<br>조회 ${esc(new Date(h.priceFetchedAt).toLocaleString("ko-KR"))}</small>`;
  return detail+action("daily-price-history",esc(h.symbol),"이력");
}
function dailyPriceRows(rows,query="") {
  const q=query.trim().toLocaleLowerCase();
  return rows.map(r=>({...r,h:typeof r.details==="string"?JSON.parse(r.details):r.details}))
    .filter(r=>!q||[r.h.symbol,r.h.name].some(v=>String(v||"").toLocaleLowerCase().includes(q)));
}
function dailyPriceTable(rows) {
  if(!rows.length)return '<p class="empty">저장된 등락률이 없습니다. KIS 시세 조회에 성공한 뒤 스냅샷을 저장하면 이력이 쌓입니다.</p>';
  return table(["거래일","종목 / 거래소","계좌 / 소유자","전 거래일","전일 종가","시세일 가격","당일 등락률","시세 조회 시각"],rows.map(({h,owner_code})=>[
    esc(h.priceDate),esc(h.name||h.symbol)+" / "+esc(h.symbol)+" · "+esc(h.exchangeCode),
    esc(h.accountName||accName(h.accountId))+" / "+esc(label("OwnerCode",owner_code)),esc(h.previousPriceDate),
    esc(fmt(h.previousClose)+" "+h.currencyCode),esc(fmt(h.dayPrice)+" "+h.currencyCode),dailyPercent(h.dailyReturn),esc(new Date(h.priceFetchedAt).toLocaleString("ko-KR"))]));
}
async function bindDailyPriceHistory() {
  const owner=state.owner,container=$("#daily-price-history");
  $("#daily-price-from").value=monthNow()+"-01";$("#daily-price-to").value=today();
  let rows=[],page=1,version=0;
  const draw=()=>{
    const selected=dailyPriceRows(rows,$("#daily-price-symbol").value),pages=Math.max(1,Math.ceil(selected.length/15));
    page=Math.max(1,Math.min(page,pages));container.innerHTML=dailyPriceTable(selected.slice((page-1)*15,page*15));
    $("#daily-price-page").textContent=`${page} / ${pages} 페이지 · ${selected.length}건`;
    $("#daily-price-prev").disabled=page===1;$("#daily-price-next").disabled=page===pages;
  };
  const load=async()=>{
    const request=++version,from=$("#daily-price-from").value,to=$("#daily-price-to").value;
    if(!from||!to||from>to)throw new Error("등락률 조회 시작일과 종료일을 확인해주세요.");
    const result=await api("/securities/daily-prices?"+new URLSearchParams({owner,from,to}));
    if(request!==version||owner!==state.owner||container!==$("#daily-price-history"))return;
    rows=result;page=1;draw();
  };
  $("#daily-price-go").onclick=run(load);$("#daily-price-symbol").oninput=()=>{page=1;draw();};
  $("#daily-price-prev").onclick=()=>{page--;draw();};$("#daily-price-next").onclick=()=>{page++;draw();};
  await load();
}
async function dailyPriceHistory(symbol) {
  const owner=state.owner,to=today(),d=new Date(to+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-90);
  const rows=await api("/securities/daily-prices?"+new URLSearchParams({owner,from:d.toISOString().slice(0,10),to}));
  if(owner!==state.owner)return;
  modal(symbol+" · 당일 등락률 이력",'<p>최근 90일 · 현지 거래일별 마지막으로 저장된 시세입니다. 장중 가격은 이후 바뀔 수 있습니다.</p>'+dailyPriceTable(dailyPriceRows(rows).filter(r=>r.h.symbol===symbol)),null);
}
// 선택 계좌의 보유종목과 거래내역만 조회한다. 통합 표와 같은 컬럼/수익률 공식을 재사용한다.
async function securityDetail(id) {
  const a=acc(id), [hh,tt]=await Promise.all([api("/securities/holdings?account="+id),api("/securities/trades?account="+id)]);
  let holdingSort={metric:"value",direction:"desc"};
  modal(a.accountName, detailGrid({계좌번호:a.accountNumber,소유자:label("OwnerCode",a.ownerCode),"계좌 총평가액":dualText(a.currentBalanceKrw,accountFx(a)?div(a.currentBalanceKrw,accountFx(a)):null),예수금:krw(a.depositKrw)+" / USD $"+usdFormat(a.depositUsd),"기준환율 (1 USD)":krw(a.exchangeRate),"마지막 API 갱신":a.lastSyncedAt||"없음"})+'<div class="tabs segmented" id="security-tabs"></div><div id="security-tab-body"></div>',null);
  const show=t=>{
    $$("#security-tabs button").forEach(b=>b.setAttribute("aria-pressed",String(b.textContent===t)));
    $("#security-tab-body").innerHTML=t==="보유종목"?holdingTable(sortPortfolio(hh.map(enrichHolding),holdingSort.metric,holdingSort.direction),a.currentBalanceKrw,holdingSort):table(["날짜","유형","종목","수량","통화","금액"],tt.filter(x=>t!=="배당금"||x.tradeType==="DIVIDEND").map(x=>[x.tradeDate, {BUY:"매수",SELL:"매도",DEPOSIT:"입금",WITHDRAWAL:"출금",DIVIDEND:"배당"}[x.tradeType],esc(x.symbol),fmt(x.quantity),x.currencyCode==="KRW"?"KRW (원)":x.currencyCode,dualAmount(x.currencyCode==="USD"?mul(x.amount,x.exchangeRate):x.amount,x.currencyCode==="USD"?x.amount:(accountFx(a)?div(x.amount,accountFx(a)):null),x.currencyCode)]));
    if(t==="보유종목") bindHoldingSort("#security-tab-body",holdingSort,next=>{holdingSort=next;show(t);});
  };
  for(const t of ["보유종목","거래내역","배당금"]) $("#security-tabs").append(button(t,()=>show(t)));
  show("보유종목");
}

async function renderPage() { await securities(); }

