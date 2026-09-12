// pages/dashboard.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function dashboard() {
  const [s, m] = await Promise.all([
    api("/summary?owner=" + state.owner),
    api("/monthly?owner=" + state.owner + "&month=" + monthNow()),
  ]);
  pageTemplate();
  $("#dashboard-metrics").innerHTML=metrics(s);
  $("#asset-composition").innerHTML=bars(s.groups,s.assets);
  $("#monthly-overview").innerHTML=`<p>수입 ${krw(m.income)} · 지출 ${krw(m.expense)}</p>`+bars(m.major,m.expense,monthNow());
  $("#trend-controls").innerHTML=trendControls();
  await bindTrend();
}

async function renderPage() { await dashboard(); }
