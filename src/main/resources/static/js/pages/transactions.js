// pages/transactions.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
let entryFilters=(()=>{
  try {
    const saved=JSON.parse(sessionStorage.getItem("transaction-filters")||"null");
    if(saved&&/^\d{4}-\d{2}-\d{2}$/.test(saved.from)&&/^\d{4}-\d{2}-\d{2}$/.test(saved.to))
      return {from:saved.from,to:saved.to,type:String(saved.type||""),category:String(saved.category||""),query:String(saved.query||""),voided:saved.voided===true};
  } catch {}
  return null;
})();
async function transactions() {
  const month = monthNow();
  pageTemplate();
  $("#from").value=month+"-01"; $("#to").value=today();
  $("#type").innerHTML='<option value="">전체 유형</option>'+opts("TransactionType","");
  $("#category").innerHTML='<option value="">전체 카테고리</option>'+state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if(entryFilters)for(const id of ["from","to","type","category","query","voided"]) {
    if(id==="voided")$("#"+id).checked=entryFilters[id];else $("#"+id).value=entryFilters[id];
  }
  for (const t of ["INCOME", "EXPENSE", "TRANSFER"])
    $("#entry-buttons").append(
      button(
        "+ " + label("TransactionType", t),
        () => editEntries(t),
        "primary",
      ),
    );
  $("#entry-buttons").append(button("카테고리 관리", manageCategories));
  const pageSize = 15, container = $("#entries");
  let entries = [], currentPage = 1, requestVersion = 0;
  const drawPage = () => {
    const pages = Math.max(1, Math.ceil(entries.length / pageSize));
    currentPage = Math.max(1, Math.min(currentPage, pages));
    const start = (currentPage - 1) * pageSize;
    container.innerHTML = entries.length?entryTable(entries.slice(start, start + pageSize), true):emptyState("조건에 맞는 거래가 없습니다.","기간이나 검색어를 바꿔보세요. 새로운 거래는 위의 수입·지출 버튼으로 기록할 수 있습니다.");
    $("#entries-page").textContent = entries.length
      ? `${currentPage} / ${pages} 페이지 · 총 ${entries.length}건 (${start + 1}–${Math.min(start + pageSize, entries.length)}건)`
      : "총 0건";
    $("#entries-first").disabled = $("#entries-prev").disabled = currentPage === 1;
    $("#entries-next").disabled = $("#entries-last").disabled = currentPage === pages;
  };
  $("#entries-first").onclick = () => { currentPage = 1; drawPage(); };
  $("#entries-prev").onclick = () => { currentPage--; drawPage(); };
  $("#entries-next").onclick = () => { currentPage++; drawPage(); };
  $("#entries-last").onclick = () => { currentPage = Math.ceil(entries.length / pageSize); drawPage(); };
  const draw = async () => {
    const owner = state.owner;
    const from = $("#from").value, to = $("#to").value;
    $("#entry-filter-error").textContent="";
    if(!from||!to||from>to){$("#entry-filter-error").textContent="시작일과 종료일을 확인해주세요. 시작일은 종료일보다 늦을 수 없습니다.";return;}
    const version = ++requestVersion;
    const filters=Object.fromEntries(["from","to","type","category","query","voided"].map(id=>[id,id==="voided"?$("#"+id).checked:$("#"+id).value]));
    const go=$("#filter");go.disabled=true;go.textContent="조회 중…";container.setAttribute("aria-busy","true");
    try {
    const rows = await api(
        "/transactions?" +
          new URLSearchParams({
            owner,
            from,
            to,
            type: $("#type").value,
            category: $("#category").value,
            q: $("#query").value,
            includeVoided: $("#voided").checked,
          }),
      );
    if (version !== requestVersion || container !== $("#entries") || owner !== state.owner) return;
    entryFilters=filters;
    try {sessionStorage.setItem("transaction-filters",JSON.stringify(filters));} catch {}
    entries = rows;
    $("#entry-filter-summary").textContent=`${from} ~ ${to} · ${label("OwnerCode",owner)} · ${rows.length}건`+(filters.query?` · 메모: ${filters.query}`:"");
    currentPage = 1;
    drawPage();
    $("#income-chart").innerHTML=lineChart(transactionPoints(rows,"INCOME",from,to),"수입");
    $("#expense-chart").innerHTML=lineChart(transactionPoints(rows,"EXPENSE",from,to),"지출");
    } catch(e) {if(version===requestVersion&&container===$("#entries")) {
      $("#entry-filter-error").textContent=e.message+(entries.length?" · 아래 내역은 이전 조회 결과입니다.":"");
      if(!entries.length) {
        container.innerHTML=emptyState("거래내역을 불러오지 못했습니다.","연결 상태를 확인하고 다시 조회해주세요.",'<button type="button" id="entries-retry">다시 조회</button>');
        $("#entries-retry").onclick=run(draw);
      }
    }}
    finally {if(version===requestVersion){go.disabled=false;go.textContent="조회";container.setAttribute("aria-busy","false");}}
  };
  $("#filter").onclick = run(draw);
  $("#query").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();run(draw)();}};
  const range=async months=>{
    const [year,monthNumber]=monthNow().split("-").map(Number),offset=months===-1?-1:months===3?-2:0;
    const start=new Date(Date.UTC(year,monthNumber-1+offset,1));
    $("#from").value=start.toISOString().slice(0,10);
    $("#to").value=months===-1?new Date(Date.UTC(year,monthNumber-1,0)).toISOString().slice(0,10):today();
    await draw();
  };
  $("#entries-this-month").onclick=run(()=>range(1));$("#entries-last-month").onclick=run(()=>range(-1));$("#entries-three-months").onclick=run(()=>range(3));
  $("#entries-reset").onclick=run(async()=>{
    for(const id of ["type","category","query"])$("#"+id).value="";$("#voided").checked=false;await range(1);
  });
  await draw();
  const m = await api("/monthly?owner=" + state.owner + "&month=" + month);
  $("#analysis").innerHTML =
    `<p>수입 ${krw(m.income)} · 지출 ${krw(m.expense)}</p>` +
    bars(m.minor, m.expense, month);
}

async function renderPage() { await transactions(); }
