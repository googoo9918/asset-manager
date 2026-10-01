// Presentation and keyboard enhancements shared by every screen. No financial mutations.
const pageDescriptions={
  review:"분류와 설정이 필요한 내역을 모아 하나씩 정리하세요.",
  dashboard:"우리 자산과 이번 달의 흐름을 한눈에 확인하세요.",
  assets:"자산과 부채를 모아 현재 구성을 살펴보세요.",
  cash:"계좌별 잔액과 입출금 내역을 확인하세요.",
  savings:"적금 납입 현황과 만기 일정을 관리하세요.",
  securities:"보유 종목을 확인하고, 필요한 주문으로 이어가세요.",
  cards:"카드 사용액, 할부와 혜택을 함께 관리하세요.",
  loans:"대출 잔액과 다음 상환 일정을 확인하세요.",
  transactions:"기간과 조건을 선택해 수입·지출을 찾아보세요.",
  planned:"예정된 출금과 완료한 거래를 확인하세요.",
  snapshots:"저장한 시점별 자산과 변동 내역을 비교하세요.",
  settings:"연결 상태와 데이터 관리 방법을 확인하세요."
};
const navigationIcons={
  review:'M5 3h14v18H5z M8 8l2 2 4-4 M8 15h8',
  dashboard:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',assets:'M3 4h7v7H3z M14 4h7v7h-7z M3 15h7v6H3z M14 15h7v6h-7z',
  cash:'M3 6h18v14H3z M3 6l14-3v3 M16 12h5v4h-5z',savings:'M4 20h16 M6 16v-4 M12 16V8 M18 16V4',
  securities:'M3 3v18h18 M6 15l5-5 4 3 6-8',cards:'M3 5h18v14H3z M3 10h18 M6 15h4',
  loans:'M4 5h16v16H4z M8 9h8 M8 13h8 M8 17h4',transactions:'M3 7h17l-4-4 M21 17H4l4 4',
  planned:'M3 6h18v15H3z M7 3v6 M17 3v6 M3 11h18 M8 15h3',snapshots:'M3 7h5l2-3h4l2 3h5v14H3z M15 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6'
};
function initUi() {
  $("#page-description").textContent=pageDescriptions[page]||pageDescriptions.dashboard;
  $("#view-context").textContent=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",weekday:"short"}).format(new Date());
  const toggle=$("#menu-toggle"),sidebar=$("#sidebar");
  const closeMenu=()=>{sidebar.classList.remove("menu-open");toggle.setAttribute("aria-expanded","false");toggle.textContent="메뉴 열기";};
  toggle.onclick=()=>{
    const expanded=toggle.getAttribute("aria-expanded")!=="true";
    sidebar.classList.toggle("menu-open",expanded);toggle.setAttribute("aria-expanded",String(expanded));toggle.textContent=expanded?"메뉴 닫기":"메뉴 열기";
  };
  sidebar.addEventListener("keydown",e=>{if(e.key==="Escape"){closeMenu();toggle.focus();}});
  $$("#main-nav a").forEach(a=>{
    if(a.pathname===location.pathname)a.setAttribute("aria-current","page");
    a.addEventListener("click",closeMenu);
  });
  $$("#main-nav a, .mobile-nav a").forEach(a=>{
    const key=a.pathname.slice(ctx.length).slice(1)||"dashboard";
    if(navigationIcons[key])a.insertAdjacentHTML("afterbegin",`<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${navigationIcons[key]}"></path></svg>`);
    if(a.pathname===location.pathname)a.setAttribute("aria-current","page");
  });
  document.addEventListener("click",e=>{
    const button=e.target.closest("[data-record-toggle]");
    if(!button)return;
    const expanded=button.getAttribute("aria-expanded")!=="true";
    button.setAttribute("aria-expanded",String(expanded));
    button.textContent=expanded?"추가 정보 접기":"추가 정보 보기";
    button.closest("tr").classList.toggle("record-expanded",expanded);
  });
  window.addEventListener("hashchange",()=>bindSectionTabs());
  // ResizeObserver follows table width changes, including tabs, filters and dialogs.
  if(typeof ResizeObserver!=="undefined") {
    const observer=new ResizeObserver(()=>enhanceTables());observer.observe(document.body);
  }
  if(typeof MutationObserver!=="undefined") {
    const observer=new MutationObserver(()=>enhanceTables());
    observer.observe($("#content"),{childList:true,subtree:true});
    observer.observe($("#modal-body"),{childList:true,subtree:true});
  }
}
function bindSectionTabs() {
  if(typeof history==="undefined")return;
  const tabs=$("#security-section-tabs");if(!tabs)return;
  const links=$$("a",tabs);
  const select=(id,focus=false)=>{
    const selected=links.find(a=>a.hash===id)||links[0];
    links.forEach(a=>{
      const active=a===selected,panel=$(a.hash);
      a.id="tab-"+a.hash.slice(1);a.setAttribute("role","tab");a.setAttribute("aria-controls",panel.id);
      a.setAttribute("aria-selected",String(active));a.tabIndex=active?0:-1;
      panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby",a.id);panel.tabIndex=0;panel.hidden=!active;
    });
    if(focus)selected.focus();
    enhanceTables();
  };
  tabs.setAttribute("role","tablist");select(location.hash);
  links.forEach((a,i)=>{
    a.onclick=e=>{e.preventDefault();history.replaceState(null,"",a.hash);select(a.hash);};
    a.onkeydown=e=>{
      const next=e.key==="ArrowRight"?(i+1)%links.length:e.key==="ArrowLeft"?(i+links.length-1)%links.length:e.key==="Home"?0:e.key==="End"?links.length-1:null;
      if(next===null)return;e.preventDefault();history.replaceState(null,"",links[next].hash);select(links[next].hash,true);
    };
  });
}
function enhanceTables() {
  $$(".table-wrap, .chart-scroll, .calendar-wrap").forEach(el=>{
    const overflows=el.scrollWidth>el.clientWidth+2;
    el.classList.toggle("is-scrollable",overflows);
    if(overflows) {
      el.tabIndex=0;el.setAttribute("role","region");
      const heading=el.closest(".panel")?.querySelector("h2")?.textContent||$("#modal-title")?.textContent||"데이터";
      el.setAttribute("aria-label",heading+" · 좌우로 이동하여 전체 내용 보기");
    } else {el.removeAttribute("tabindex");el.removeAttribute("role");el.removeAttribute("aria-label");}
  });
}
function emptyState(title,description="",actionHtml="") {
  return `<div class="empty-state"><span class="empty-mark" aria-hidden="true">—</span><strong>${esc(title)}</strong>${description?`<p>${esc(description)}</p>`:""}${actionHtml}</div>`;
}
function statusBadge(text,tone="neutral") {
  return `<span class="status-badge status-${esc(tone)}">${esc(text)}</span>`;
}
