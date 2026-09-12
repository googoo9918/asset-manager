// common/charts.js — 여러 화면에서 사용하는 공통 기능입니다.
function trendControls() {
  return `<div class="toolbar"><select id="trend-period" aria-label="조회 기간"><option value="1">1개월</option><option value="3" selected>3개월</option><option value="6">6개월</option><option value="12">1년</option><option value="all">전체</option><option value="custom">직접 지정</option></select><input type="date" id="trend-from" aria-label="추이 시작일"><input type="date" id="trend-to" aria-label="추이 종료일" value="${today()}"><select id="trend-metric" aria-label="추이 지표"><option value="net_assets">순자산</option><option value="total_assets">총자산</option><option value="total_debts">총부채</option><option value="CASH">현금성 자산</option><option value="SAVINGS">적금</option><option value="SECURITIES">증권</option></select><button id="trend-go">조회</button></div>`;
}
// 소유자에 맞는 증권 스냅샷 상세를 합산한다. 일중 여러 번 저장한 경우 마지막 시점을 사용한다.
// 차트 좌표의 Number 변환은 그림에만 사용하고 표/합계에는 decimal 기반 금액을 유지한다.
async function bindTrend() {
  const rows = await api("/snapshots?owner=" + state.owner);
  let requestVersion = 0;
  const container = $("#trend");
  const draw = async () => {
    const version = ++requestVersion;
    const period = $("#trend-period").value;
    let from = $("#trend-from").value,
      to = $("#trend-to").value;
    if (period !== "custom") {
      if (period === "all") from = "";
      else {
        const d = new Date(today());
        d.setMonth(d.getMonth() - Number(period));
        from = d.toISOString().slice(0, 10);
      }
      $("#trend-from").value = from;
    }
    const latest = new Map();
    rows.forEach((r) => {
      const d = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(new Date(r.captured_at));
      if ((!from || d >= from) && (!to || d <= to)) {
        const previous = latest.get(d);
        if (!previous || new Date(r.captured_at) > new Date(previous.captured_at) ||
            (r.captured_at === previous.captured_at && Number(r.id) > Number(previous.id))) latest.set(d, r);
      }
    });
    const values = [...latest].sort(([a], [b]) => a.localeCompare(b));
    const metric = $("#trend-metric").value;
    let points;
    if (["CASH", "SAVINGS", "SECURITIES"].includes(metric)) {
      points = await Promise.all(
        values.map(async ([date, r]) => {
          const details = await api("/snapshots/" + r.id);
          const selected=details.filter(d=>d.item_type==="ACCOUNT"&&d.asset_type===metric&&(state.owner==="JOINT"||d.owner_code===state.owner));
          let dollars=null;
          if(metric==="SECURITIES") {
            const converted=selected.map(d=>{const data=typeof d.details==="string"?JSON.parse(d.details):d.details;
              return data?.lastSyncedAt&&decimal(data.exchangeRate)>0n&&decimal(data.exchangeRate)!==decimal("1") ? div(d.amount_krw,data.exchangeRate) : null;});
            if(converted.every(v=>v!==null)) dollars=sum(converted);
          }
          return {date,value:sum(selected.map(d=>d.amount_krw)),
            extra:metric==="SECURITIES"?(dollars===null?"USD 환율 미확인":"USD $"+usdFormat(dollars)+" (당시 환율 환산)"):"",
            dollars};
        }),
      );
    } else points = values.map(([date, r]) => ({ date, value: r[metric] }));
    if (version !== requestVersion || $("#trend") !== container) return;
    $("#trend").innerHTML =
      lineChart(points) +
      table(
        ["날짜", "금액 (원)", ...(metric==="SECURITIES"?["USD (당시 환율 환산)"]:[])],
        points.map((p) => [p.date, krw(p.value), ...(metric==="SECURITIES"?[p.dollars===null?"환율 미확인":"USD $"+usdFormat(p.dollars)]:[])]),
      );
  };
  $("#trend-go").onclick =
    $("#trend-period").onchange =
    $("#trend-metric").onchange =
      run(draw);
  await draw();
}

/** 금액은 문자열로 보존하고 SVG 좌표만 Number로 변환한다. */
function tipAttrs(date, value, extra = "") {
  return `tabindex="0" data-chart-tip="${esc(date + " · " + krw(value) + (extra ? " · " + extra : ""))}"`;
}
function lineChart(points, title = "자산 추이") {
  if (!points.length) return '<p class="empty">표시할 기록이 없습니다. 자산 추이는 스냅샷 저장 후 확인할 수 있습니다.</p>';
  const values=points.map(p=>Number(p.value)), min=Math.min(...values), max=Math.max(...values), span=max-min||1;
  const xy=points.map((p,i)=>[70+(points.length===1?390:i*780/(points.length-1)),180-(Number(p.value)-min)*140/span]);
  // 투명한 세로 영역이 마우스 위치에서 가장 가까운 날짜를 선택한다. 작은 점을 정확히 겨냥할 필요가 없다.
  const hits=xy.map(([x,y],i)=>{
    const left=i===0?50:(xy[i-1][0]+x)/2, right=i===xy.length-1?880:(x+xy[i+1][0])/2;
    return `<rect x="${left}" y="20" width="${Math.max(1,right-left)}" height="180" fill="transparent" ${tipAttrs(points[i].date,points[i].value,points[i].extra||title)} aria-label="${esc(points[i].date+" "+krw(points[i].value))}"/>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 930 235" role="img" aria-label="${esc(title)}"><path d="M65 25V185H885" fill="none" stroke="#DAD2B7"/><polyline points="${xy.map(p=>p.join(",")).join(" ")}" fill="none" stroke="#B18512" stroke-width="3"/>${xy.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#B18512"/>`).join("")}<text x="65" y="218">${esc(points[0].date)}</text><text x="780" y="218">${esc(points.at(-1).date)}</text><text x="65" y="16">${esc(title)} · 최고 ${krw(points[values.indexOf(max)].value)}</text>${hits}</svg>`;
}
/** 거래일별 실제 기록만 합산한다. 자산이체, 카드대금 출금, 취소거래는 수입/지출 그래프에서 제외한다. */
function transactionPoints(rows, type, from, to) {
  const start=from||rows.map(r=>r.transactionDate).sort()[0]||today(), end=to||today();
  if(start>end) return [];
  const grouped=new Map();
  rows.filter(r=>!r.voided&&r.transactionType===type).forEach(r=>grouped.set(r.transactionDate,sum([grouped.get(r.transactionDate)||"0",r.amount])));
  // 매우 긴 기간도 하루 단위로 처리하되 입력 날짜 범위 자체는 브라우저 date control을 따른다.
  const points=[];let d=new Date(start+"T00:00:00Z"), last=new Date(end+"T00:00:00Z");
  while(d<=last){const date=d.toISOString().slice(0,10);points.push({date,value:grouped.get(date)||"0"});d.setUTCDate(d.getUTCDate()+1);}
  return points;
}
// 단일 툴팁을 재사용한다. dialog 내 그래프에서는 top layer에 들어가도록 툴팁도 해당 dialog로 옮긴다.
const chartTooltip=$("#chart-tooltip");
function showChartTooltip(target,x,y) {
  const parent=target.closest("dialog")||document.body;
  if(chartTooltip.parentNode!==parent) parent.append(chartTooltip);
  chartTooltip.textContent=target.dataset.chartTip;chartTooltip.hidden=false;
  chartTooltip.style.left=Math.max(8,Math.min(x+14,innerWidth-chartTooltip.offsetWidth-10))+"px";
  chartTooltip.style.top=Math.max(8,Math.min(y+16,innerHeight-chartTooltip.offsetHeight-10))+"px";
}
document.addEventListener("pointermove",e=>{const t=e.target.closest("[data-chart-tip]");if(t)showChartTooltip(t,e.clientX,e.clientY);else chartTooltip.hidden=true;});
document.addEventListener("focusin",e=>{const t=e.target.closest("[data-chart-tip]");if(t){const b=t.getBoundingClientRect();showChartTooltip(t,b.left,b.top);}else chartTooltip.hidden=true;});
document.addEventListener("scroll",()=>chartTooltip.hidden=true,true);
document.addEventListener("pointerout",e=>{if(!e.relatedTarget) chartTooltip.hidden=true;});
