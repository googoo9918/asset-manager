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
  const draw = async () => {
    const rows = await api(
        "/transactions?" +
          new URLSearchParams({
            owner: state.owner,
            from: $("#from").value,
            to: $("#to").value,
            type: $("#type").value,
            category: $("#category").value,
            q: $("#query").value,
            includeVoided: $("#voided").checked,
          }),
      );
    $("#entries").innerHTML=entryTable(rows,true);
    $("#income-chart").innerHTML=lineChart(transactionPoints(rows,"INCOME",$("#from").value,$("#to").value),"수입");
    $("#expense-chart").innerHTML=lineChart(transactionPoints(rows,"EXPENSE",$("#from").value,$("#to").value),"지출");
  };
  $("#filter").onclick = run(draw);
  await draw();
  const m = await api("/monthly?owner=" + state.owner + "&month=" + month);
  $("#analysis").innerHTML =
    `<p>수입 ${krw(m.income)} · 지출 ${krw(m.expense)}</p>` +
    bars(m.minor, m.expense, month);
}

async function renderPage() { await transactions(); }
