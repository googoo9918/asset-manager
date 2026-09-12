// pages/assets.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function assets() {
  const s = await api("/summary?owner=" + state.owner);
  pageTemplate();
  $("#asset-metrics").innerHTML=metrics(s);
  $("#asset-breakdown").innerHTML=bars(s.groups,s.assets)+table(["유형","계좌 수","현재 금액","비중","상세"], Object.entries(s.groups).map(([type,amount])=>[label("AssetType",type),own(state.accounts).filter(a=>a.assetType===type).length,krw(amount),pct(amount,s.assets)+"%",`<a href="${ctx}/${{CASH:"cash",SAVINGS:"savings",SECURITIES:"securities"}[type]}">보기</a>`])
    );
  $("#trend-controls").innerHTML=trendControls();
  await bindTrend();
}

async function renderPage() { await assets(); }
