// pages/dashboard.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function dashboard() {
  const [s, m] = await Promise.all([
    api("/summary?owner=" + state.owner),
    api("/monthly?owner=" + state.owner + "&month=" + monthNow()),
  ]);
  pageTemplate();
  const reviewStatus=$('#dashboard-review');
  if(reviewStatus)api('/review/summary?owner='+state.owner).then(result=>{
    if(reviewStatus!==$('#dashboard-review'))return;
    reviewStatus.textContent=result.total?`전체 ${result.total}건 · 미분류 ${result.counts?.CATEGORY||0}건 · 카드 기간 ${result.counts?.CARD_PERIOD||0}건 · 할부 연결 ${result.counts?.INSTALLMENT||0}건 · 잔고 갱신 ${result.counts?.SYNC||0}건 (나중에 보기 포함)`:'현재 확인이 필요한 항목이 없습니다.';
  }).catch(()=>{if(reviewStatus===$('#dashboard-review'))reviewStatus.textContent='확인할 내역 화면에서 다시 조회해주세요.';});
  $("#dashboard-metrics").innerHTML=metrics(s);
  $("#asset-composition").innerHTML=bars(s.groups,s.assets);
  $("#monthly-overview").innerHTML=`<div class="monthly-summary"><div><span>수입</span><strong>${krw(m.income)}</strong></div><div><span>지출</span><strong>${krw(m.expense)}</strong></div><div><span>수입 − 지출</span><strong>${krw(sub(m.income,m.expense))}</strong></div></div>`+(Object.keys(m.major).length?bars(m.major,m.expense,monthNow()):emptyState("이번 달 지출 내역이 없습니다.","거래를 기록하면 지출 구성을 확인할 수 있어요."));
  $("#trend-controls").innerHTML=trendControls();
  await bindTrend();
}

async function renderPage() { await dashboard(); }
