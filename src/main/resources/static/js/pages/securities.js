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
    return {...p,costKrw:sum(hh.map(h=>h.costKrw)),costUsd:nullableSum(hh.map(h=>h.costUsd)),valueUsd:nullableSum(hh.map(h=>h.valueUsd)),
      priceKrw:div(p.valueKrw,p.quantity),priceUsd:hh.some(h=>h.valueUsd===null)?null:div(sum(hh.map(h=>h.valueUsd)),p.quantity)};
  });
}
/** 같은 종목/통화를 통합한 가중평균과 계좌 단독 조회에서 동일한 컬럼/공식을 사용한다. */
function holdingTable(rows,total) {
  return table(["종목 / 코드","원래 통화","수량","평균매입가 KRW / USD","현재가 KRW / USD","매입금액 KRW / USD","평가금액 KRW / USD","평가손익 KRW / USD","수익률 (환율 제외)","비중"],rows.map(h=>{
    const cash=h.symbol==="CASH", currency=h.currencyCode||h.currency, cost=h.costNative??mul(h.averagePrice,h.quantity), profit=sub(h.valueNative,cost);
    return [esc(h.name)+" / "+esc(h.symbol),currency==="KRW"?"KRW (원)":currency,cash?"—":fmt(h.quantity),
      cash?"—":dualAmount(div(h.costKrw,h.quantity),h.costUsd===null?null:div(h.costUsd,h.quantity),currency),
      cash?"—":dualAmount(h.priceKrw,h.priceUsd,currency),cash?"—":dualAmount(h.costKrw,h.costUsd,currency),
      dualAmount(h.valueKrw,h.valueUsd,currency),cash?"—":dualAmount(sub(h.valueKrw,h.costKrw),h.valueUsd===null||h.costUsd===null?null:sub(h.valueUsd,h.costUsd),currency),
      cash||decimal(cost)===0n?"—":pct(profit,cost)+"%",pct(h.valueKrw,total)+"%"];
  }));
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
  return `<div class="pie-layout"><svg viewBox="0 0 320 320" role="img" aria-label="포트폴리오 비중 원형 차트">${slices}</svg><ul>${positive.map((p,i)=>`<li><span class="swatch" style="background:${palette[i%palette.length]}"></span>${esc(p.name)} · ${dualAmount(p.valueKrw,p.valueUsd,p.currency)} · ${pct(p.valueKrw,denominator)}%</li>`).join("")}</ul></div>`;
}
async function securities() {
  const [holdings, portfolio] = await Promise.all([api("/securities/holdings?owner="+state.owner), api("/securities/portfolio?owner="+state.owner)]);
  const aa=own(state.accounts).filter(a=>a.assetType==="SECURITIES");
  const total = sum(aa.map(a=>a.currentBalanceKrw));
  pageTemplate();
  $("#trend-controls").innerHTML=trendControls();
  $("#reorder").onclick=run(()=>openOrder("SECURITIES"));
  $("#new-security").onclick=()=>editAccount(null,"SECURITIES");
  const draw=()=>{
    const visible=aa.filter(a=>a.accountName.includes($("#security-search").value));
    $("#security-list").innerHTML=table(["계좌", "소유자", "예수금 KRW (원) / USD", "매입금액 KRW / USD", "평가금액 KRW / USD", "평가손익 KRW / USD", "수익률 (환율 제외)", "계좌 총평가액", "API 갱신", "관리"],visible.map(a=>{
      const hh=holdings.filter(h=>eq(h.accountId,a.id)), cost=sum(hh.map(h=>mul(mul(h.averagePrice,h.quantity),h.exchangeRate))), value=sum(hh.map(h=>h.valueKrw));
      const rate=accountFx(a), costUsd=nullableSum(hh.map(h=>usdValue(h,mul(h.averagePrice,h.quantity)))), valueUsd=nullableSum(hh.map(h=>usdValue(h,h.valueNative)));

      return [ action("security-detail",a.id,esc(a.accountName)), label("OwnerCode",a.ownerCode), krw(a.depositKrw)+" / USD $"+usdFormat(a.depositUsd), dualAmount(cost,costUsd),dualAmount(value,valueUsd),dualAmount(sub(value,cost),costUsd===null||valueUsd===null?null:sub(valueUsd,costUsd)),decimal(cost)===0n?"—":pct(sub(value,cost),cost)+"%",dualAmount(a.currentBalanceKrw,rate?div(a.currentBalanceKrw,rate):null),a.lastSyncedAt?esc(new Date(a.lastSyncedAt).toLocaleString("ko-KR")):"미갱신", action("security-detail",a.id,"종목 상세")+action("account-edit",a.id,"수정")+action("account-close",a.id,"해지")];
    }));
  };
  $("#security-search").oninput=draw; draw();
  let layout=preference("portfolio-layout","bar");
  $("#portfolio-sort").value=preference("portfolio-sort","desc");
  // 내림/오름차순은 평가금액 기준이다. 같은 분모를 쓰는 비중 정렬과 동일하다.
  const drawPortfolio=()=>{
    const direction=$("#portfolio-sort").value;
    const rows=enrichedPortfolio(portfolio,holdings,aa).sort((a,b)=> {const d=decimal(a.valueKrw)-decimal(b.valueKrw);return (d<0n?-1:d>0n?1:0)*(direction==="asc"?1:-1);});
    $("#portfolio-chart").innerHTML=portfolioChart(rows,total,layout);
    $("#portfolio-table").innerHTML=holdingTable(rows,total);
    $$("[data-layout]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.layout===layout)));
  };
  $$("[data-layout]").forEach(b=>b.onclick=()=>{layout=b.dataset.layout;localStorage.setItem("portfolio-layout",JSON.stringify(layout));drawPortfolio();});
  $("#portfolio-sort").onchange=()=>{localStorage.setItem("portfolio-sort",JSON.stringify($("#portfolio-sort").value));drawPortfolio();};
  drawPortfolio();
  $("#trend-metric").value="SECURITIES";
  $("#trend-metric").closest("select").hidden=true;
  await bindTrend();
}
// 선택 계좌의 보유종목과 거래내역만 조회한다. 통합 표와 같은 컬럼/수익률 공식을 재사용한다.
async function securityDetail(id) {
  const a=acc(id), [hh,tt]=await Promise.all([api("/securities/holdings?account="+id),api("/securities/trades?account="+id)]);
  modal(a.accountName, detailGrid({계좌번호:a.accountNumber,소유자:label("OwnerCode",a.ownerCode),"계좌 총평가액":dualText(a.currentBalanceKrw,accountFx(a)?div(a.currentBalanceKrw,accountFx(a)):null),예수금:krw(a.depositKrw)+" / USD $"+usdFormat(a.depositUsd),"기준환율 (1 USD)":krw(a.exchangeRate),"마지막 API 갱신":a.lastSyncedAt||"없음"})+'<div class="tabs segmented" id="security-tabs"></div><div id="security-tab-body"></div>',null);
  const show=t=>{
    $$("#security-tabs button").forEach(b=>b.setAttribute("aria-pressed",String(b.textContent===t)));
    $("#security-tab-body").innerHTML=t==="보유종목"?holdingTable(hh.map(enrichHolding),a.currentBalanceKrw):table(["날짜","유형","종목","수량","통화","금액"],tt.filter(x=>t!=="배당금"||x.tradeType==="DIVIDEND").map(x=>[x.tradeDate, {BUY:"매수",SELL:"매도",DEPOSIT:"입금",WITHDRAWAL:"출금",DIVIDEND:"배당"}[x.tradeType],esc(x.symbol),fmt(x.quantity),x.currencyCode==="KRW"?"KRW (원)":x.currencyCode,dualAmount(x.currencyCode==="USD"?mul(x.amount,x.exchangeRate):x.amount,x.currencyCode==="USD"?x.amount:(accountFx(a)?div(x.amount,accountFx(a)):null),x.currencyCode)]));
  };
  for(const t of ["보유종목","거래내역","배당금"]) $("#security-tabs").append(button(t,()=>show(t)));
  show("보유종목");
}

async function renderPage() { await securities(); }
