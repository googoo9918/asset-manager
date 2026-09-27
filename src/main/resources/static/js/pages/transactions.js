// pages/transactions.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function transactions() {
  const month = monthNow();
  pageTemplate();
  $("#from").value=month+"-01"; $("#to").value=today();
  $("#type").innerHTML=opts("TransactionType","",true);
  $("#category").innerHTML='<option value="">전체 카테고리</option>'+state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
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
    container.innerHTML = entryTable(entries.slice(start, start + pageSize), true);
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
    const version = ++requestVersion, owner = state.owner;
    const from = $("#from").value, to = $("#to").value;
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
    entries = rows;
    currentPage = 1;
    drawPage();
    $("#income-chart").innerHTML=lineChart(transactionPoints(rows,"INCOME",from,to),"수입");
    $("#expense-chart").innerHTML=lineChart(transactionPoints(rows,"EXPENSE",from,to),"지출");
  };
  $("#filter").onclick = run(draw);
  await draw();
  const m = await api("/monthly?owner=" + state.owner + "&month=" + month);
  $("#analysis").innerHTML =
    `<p>수입 ${krw(m.income)} · 지출 ${krw(m.expense)}</p>` +
    bars(m.minor, m.expense, month);
}

async function renderPage() { await transactions(); }
