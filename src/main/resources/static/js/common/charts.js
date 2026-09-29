// common/charts.js — 여러 화면에서 사용하는 공통 기능입니다.
function trendControls() {
  return `<div class="toolbar"><select id="trend-period" aria-label="조회 기간"><option value="1">1개월</option><option value="3" selected>3개월</option><option value="6">6개월</option><option value="12">1년</option><option value="all">전체</option><option value="custom">직접 지정</option></select><input type="date" id="trend-from" aria-label="추이 시작일"><input type="date" id="trend-to" aria-label="추이 종료일" value="${today()}"><select id="trend-metric" aria-label="추이 지표"><option value="net_assets">순자산</option><option value="total_assets">총자산</option><option value="total_debts">총부채</option><option value="CASH">현금성 자산</option><option value="SAVINGS">적금</option><option value="SECURITIES">증권</option></select><button id="trend-go">조회</button></div>`;
}
// 소유자에 맞는 증권 스냅샷 상세를 합산한다. 일중 여러 번 저장한 경우 마지막 시점을 사용한다.
// 차트 좌표의 Number 변환은 그림에만 사용하고 표/합계에는 decimal 기반 금액을 유지한다.
async function bindTrend() {
  const owner = state.owner;
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
    if(from&&to&&from>to)throw new Error("추이 시작일은 종료일보다 늦을 수 없습니다.");
    const latest = new Map();
    rows.forEach((r) => {
      const d = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(new Date(r.captured_at));
      {
        const previous = latest.get(d);
        if (!previous || new Date(r.captured_at) > new Date(previous.captured_at) ||
            (r.captured_at === previous.captured_at && Number(r.id) > Number(previous.id))) latest.set(d, r);
      }
    });
    const daily = [...latest].sort(([a], [b]) => a.localeCompare(b));
    const values = daily.filter(([d]) => (!from || d >= from) && (!to || d <= to));
    // Keep the preceding recorded day even when it falls outside the displayed range.
    const predecessors = new Map(daily.map(([, r], i) => [String(r.id), daily[i - 1]]));
    const metric = $("#trend-metric").value;
    let points;
    if (["CASH", "SAVINGS", "SECURITIES"].includes(metric)) {
      points = await Promise.all(
        values.map(async ([date, r]) => {
          const details = await api("/snapshots/" + r.id);
          const selected=details.filter(d=>d.item_type==="ACCOUNT"&&d.asset_type===metric&&(owner==="JOINT"||d.owner_code===owner));
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
    if (version !== requestVersion || $("#trend") !== container || owner !== state.owner) return;
    const priorTotals = new Map(points.map((p, i) => [String(values[i][1].id), p.value]));
    const firstPrevious = values.length ? predecessors.get(String(values[0][1].id)) : null;
    if (firstPrevious && !priorTotals.has(String(firstPrevious[1].id))) {
      const r = firstPrevious[1];
      priorTotals.set(String(r.id), ["CASH", "SAVINGS", "SECURITIES"].includes(metric)
        ? snapshotTotal(await api("/snapshots/" + r.id), owner, metric) : r[metric]);
    }
    if (version !== requestVersion || $("#trend") !== container || owner !== state.owner) return;
    $("#trend").innerHTML =
      lineChart(points) +
      '<p class="muted">날짜별 마지막 저장 기록을 비교합니다. 증감액을 누르면 변동 내역을 볼 수 있습니다. 기록이 없는 날은 직전 기록과 비교합니다.</p>' +
      table(
        ["날짜", "금액 (원)", ...(metric==="SECURITIES"?["USD (당시 환율 환산)"]:[]), "이전 기록 대비", "비교 기준일"],
        points.map((p, i) => {
          const previous = predecessors.get(String(values[i][1].id));
          return [p.date, krw(p.value), ...(metric==="SECURITIES"?[p.dollars===null?"환율 미확인":"USD $"+usdFormat(p.dollars)]:[]),
            previous ? `<button type="button" data-trend-change="${i}" aria-label="${p.date} 변동 내역">${signedChange(sub(p.value, priorTotals.get(String(previous[1].id))))} · 상세</button>` : "첫 기록",
            previous ? previous[0] : "—"];
        }),
      );
    container.onclick = run(async e => {
      const button = e.target.closest("[data-trend-change]");
      if (!button) return;
      const current = values[Number(button.dataset.trendChange)]?.[1];
      if (!current) return;
      const previous = predecessors.get(String(current.id))[1];
      button.disabled = true;
      try {
        const [before, after] = await Promise.all([previous, current].map(r => api("/snapshots/" + r.id)));
        if (version !== requestVersion || $("#trend") !== container || owner !== state.owner) return;
        modal("자산 변동 내역", snapshotChangesHtml(before, after, owner, metric, previous, current), null);
      } finally { button.disabled = false; }
    });
  };
  $("#trend-go").onclick =
    $("#trend-period").onchange =
    $("#trend-metric").onchange =
      run(draw);
  $("#trend-from").onchange=$("#trend-to").onchange=()=>{$("#trend-period").value="custom";};
  await draw();
}

const snapshotMetricNames = {net_assets:"순자산",total_assets:"총자산",total_debts:"총부채",CASH:"현금성 자산",SAVINGS:"적금",SECURITIES:"증권"};
function signedChange(value) { return (decimal(value) > 0n ? "+" : "") + krw(value); }
function snapshotData(item) { return typeof item?.details === "string" ? JSON.parse(item.details) : item?.details || {}; }
function snapshotIncluded(item, owner, metric) {
  if (owner !== "JOINT" && item.owner_code !== owner) return false;
  if (item.item_type === "LOAN") return metric === "net_assets" || metric === "total_debts";
  return item.item_type === "ACCOUNT" && metric !== "total_debts" &&
    (["net_assets", "total_assets"].includes(metric) || item.asset_type === metric);
}
function snapshotAmount(item, metric) {
  return item.item_type === "LOAN" && metric === "net_assets" ? sub("0", item.amount_krw) : item.amount_krw;
}
function snapshotTotal(items, owner, metric) {
  return sum(items.filter(i => snapshotIncluded(i, owner, metric)).map(i => snapshotAmount(i, metric)));
}
// Compare each side independently: owner/type changes are entries/exits for the selected scope.
// Positions are children of accounts, never added a second time to the asset total.
function snapshotChanges(before, after, owner, metric) {
  const rows = new Map();
  [before, after].forEach((items, side) => items.filter(i => snapshotIncluded(i, owner, metric)).forEach(item => {
    const key = item.item_type + ":" + item.entity_id;
    if (!rows.has(key)) rows.set(key, {key, before:"0", after:"0"});
    const row = rows.get(key);
    row[side ? "after" : "before"] = item.amount_krw;
    row[side ? "afterItem" : "beforeItem"] = item;
  }));
  const result = [...rows.values()].map(row => {
    const item = row.afterItem || row.beforeItem, data = snapshotData(item);
    row.item = item;
    row.name = data.accountName || data.loanName || "이름 없는 항목";
    row.change = sub(row.after, row.before);
    row.contribution = item.item_type === "LOAN" && metric === "net_assets" ? sub("0", row.change) : row.change;
    row.status = !row.beforeItem ? "비교 범위에 추가" : !row.afterItem ? "비교 범위에서 제외" : "잔액 변동";
    row.children = [];
    if (item.item_type === "ACCOUNT" && [row.beforeItem, row.afterItem].some(i => i?.asset_type === "SECURITIES")) {
      const positions = new Map();
      [before, after].forEach((items, side) => {
        if (!row[side ? "afterItem" : "beforeItem"]) return;
        items.filter(i => i.item_type === "POSITION" && (owner === "JOINT" || i.owner_code === owner)).forEach(i => {
          const d = snapshotData(i);
          if (!eq(d.accountId, item.entity_id)) return;
          const key = JSON.stringify([d.symbol, d.currencyCode]);
          if (!positions.has(key)) positions.set(key, {name:d.name || d.symbol, symbol:d.symbol, before:"0", after:"0"});
          const p = positions.get(key);
          p[side ? "after" : "before"] = sum([p[side ? "after" : "before"], i.amount_krw]);
          p[side ? "afterData" : "beforeData"] = d;
        });
      });
      row.children = [...positions.values()].map(p => ({...p, change:sub(p.after, p.before)}));
      const residualBefore = sub(row.before, sum(row.children.map(p => p.before)));
      const residualAfter = sub(row.after, sum(row.children.map(p => p.after)));
      row.children.push({name:"예수금·기타 잔액 (계좌 합계 − 보유종목)",before:residualBefore,after:residualAfter,change:sub(residualAfter,residualBefore)});
      if (row.beforeItem && row.afterItem) row.status = "계좌 평가액 변동";
    }
    return row;
  });
  result.sort((a,b) => {
    const abs = v => decimal(v) < 0n ? -decimal(v) : decimal(v);
    return abs(a.contribution) > abs(b.contribution) ? -1 : abs(a.contribution) < abs(b.contribution) ? 1 : a.key.localeCompare(b.key);
  });
  return {before:snapshotTotal(before,owner,metric),after:snapshotTotal(after,owner,metric),
    change:sum(result.map(r => r.contribution)),rows:result};
}
function snapshotChangesHtml(before, after, owner, metric, from, to) {
  const comparison = snapshotChanges(before, after, owner, metric);
  const time = r => new Date(r.captured_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
  const changed = comparison.rows.filter(r => decimal(r.change) !== 0n || r.children.some(p => decimal(p.change) !== 0n));
  const positionInfo = p => {
    const text = d => d ? `${fmt(d.quantity)}주 · ${money(d.currentPrice,d.currencyCode)} · 환율 ${fmt(d.exchangeRate)}` : "미보유";
    return p.symbol ? `${esc(p.symbol)}<br>${esc(text(p.beforeData))} → ${esc(text(p.afterData))}` : "계좌 총액에서 종목 평가액을 뺀 나머지";
  };
  return '<div class="snapshot-changes">' + detailGrid({"비교 시작":time(from),"비교 종료":time(to),"소유자":label("OwnerCode",owner),"지표":snapshotMetricNames[metric],
    "이전 금액":krw(comparison.before),"이후 금액":krw(comparison.after),"총 변동":signedChange(comparison.change)}) +
    '<p>저장 당시 잔액·평가액 기준입니다. 입출금 사유와 주가·환율별 영향은 이 비교만으로 확정하지 않습니다.</p>' +
    (metric === "net_assets" ? '<p>대출 잔액이 줄면 순자산에는 증가로 반영됩니다.</p>' : "") +
    `<p>갱신 결과: ${esc(from.sync_status || "—")} → ${esc(to.sync_status || "—")}</p>` +
    (changed.length ? table(["항목 / 세부 내역","유형 / 소유자","이전 잔액","이후 잔액","잔액 증감",snapshotMetricNames[metric]+" 반영액"],changed.map(r => {
      const oldName = snapshotData(r.beforeItem).accountName || snapshotData(r.beforeItem).loanName;
      const owners = [r.beforeItem?.owner_code,r.afterItem?.owner_code].filter(Boolean);
      return [`${esc(r.name)}${oldName && oldName !== r.name ? '<br>이전 이름: '+esc(oldName) : ""}<small class="change-caption">${esc(r.status)}</small>`,
        esc(r.item.item_type === "LOAN" ? "대출" : label("AssetType",r.item.asset_type))+" / "+esc([...new Set(owners)].map(o=>label("OwnerCode",o)).join(" → ")),
        krw(r.before),krw(r.after),signedChange(r.change),signedChange(r.contribution)];
    })) : '<p class="empty">이 기간에 금액 변동이 없습니다.</p>') +
    `<p><strong>항목별 반영액 합계: ${signedChange(comparison.change)}</strong></p>` +
    changed.map(r => {
      const children = r.children.filter(p => decimal(p.change) !== 0n);
      return children.length ? `<details><summary>${esc(r.name)} · 종목·예수금 변동 ${children.length}건</summary>${table(["항목","이전","이후","증감","수량 · 가격 · 환율 (이전 → 이후)"],children.map(p => [esc(p.name),krw(p.before),krw(p.after),signedChange(p.change),positionInfo(p)]))}<p>세부 내역은 위 계좌 금액에 포함됩니다.</p></details>` : "";
    }).join("") + '<p class="muted">금액은 원 단위로 반올림하여 표시합니다.</p></div>';
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
  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 930 235" role="img" aria-label="${esc(title)}"><path d="M65 25V185H885" fill="none" stroke="#DAD2B7"/><polyline points="${xy.map(p=>p.join(",")).join(" ")}" fill="none" stroke="#B18512" stroke-width="3"/>${xy.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#B18512"/>`).join("")}<text x="65" y="218">${esc(points[0].date)}</text><text x="780" y="218">${esc(points.at(-1).date)}</text><text x="65" y="16">${esc(title)} · 최고 ${krw(points[values.indexOf(max)].value)}</text>${hits}</svg></div>`;
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
