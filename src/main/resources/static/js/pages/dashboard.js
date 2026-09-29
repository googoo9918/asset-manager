// pages/dashboard.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function dashboard() {
  const [s, m] = await Promise.all([
    api("/summary?owner=" + state.owner),
    api("/monthly?owner=" + state.owner + "&month=" + monthNow()),
  ]);
  pageTemplate();
  $("#dashboard-metrics").innerHTML=metrics(s);
  $("#asset-composition").innerHTML=bars(s.groups,s.assets);
  $("#monthly-overview").innerHTML=`<div class="monthly-summary"><div><span>수입</span><strong>${krw(m.income)}</strong></div><div><span>지출</span><strong>${krw(m.expense)}</strong></div><div><span>수입 − 지출</span><strong>${krw(sub(m.income,m.expense))}</strong></div></div>`+(Object.keys(m.major).length?bars(m.major,m.expense,monthNow()):emptyState("이번 달 지출 내역이 없습니다.","거래를 기록하면 지출 구성을 확인할 수 있어요."));
  $("#trend-controls").innerHTML=trendControls();
  await bindTrend();
}

async function renderPage() { await dashboard(); }
