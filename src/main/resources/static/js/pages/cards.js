// pages/cards.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function cards() {
  const es = await api(
      "/transactions?from=" + monthNow() + "-01&to=" + today(),
    ),
    occ = await api("/occurrences?month=" + monthNow());
  pageTemplate();
  $("#reorder").onclick=run(()=>openOrder("CARDS"));
  $("#new").onclick = () => editCard();
  // JSP and static resources can be temporarily out of sync during a local update.
  // Keep the card list usable, and resolve the optional import module only when invoked.
  const kbImportButton = $("#kb-import");
  if (kbImportButton) kbImportButton.onclick = run(() => {
    if (typeof openKbImport !== "function")
      throw new Error("KB 가져오기 파일이 로드되지 않았습니다. 앱 재시작 후 페이지를 새로고침해주세요.");
    openKbImport();
  });
  const draw = () => {
    const rows = own(state.cards).filter(
      (c) =>
        ($("#status").value === "ALL" || c.status === $("#status").value) &&
        c.cardName.includes($("#search").value),
    );
    $("#list").innerHTML = table(
      [
        "카드명",
        "소유자",
        "유형",
        "결제계좌",
        "이용기간 마감",
        "이번 달 사용액",
        "이번 결제 일정",
        "관리",
      ],
      rows.map((c) => {
        const due = occ.find((o) => eq(o.cardId, c.id));
        return [
          esc(c.cardName),
          label("OwnerCode", c.ownerCode),
          label("CardType", c.cardType),
          esc(accName(c.accountId)),
          c.cardType==='DEBIT'?'즉시 출금':c.billingClosingDay?`${['당월','전월','전전월'][c.billingMonthOffset]} ${c.billingClosingDay===31?'말일':c.billingClosingDay+'일'}`:'미설정',
          krw(
            sum(
              es
                .filter(
                  (e) => !e.voided && eq(e.cardId, c.id) && e.transactionType === "EXPENSE",
                )
                .map((e) => e.amount),
            ),
          ),
          due
            ? esc(due.actualDate || due.dueDate) +
              " · " +
              { PENDING: "입력 필요", COMPLETED: "완료", CANCELLED: "취소" }[
                due.state
              ]
            : "—",
          action("card-detail", c.id, "상세") +
            action("card-edit", c.id, "수정") +
            action("card-close", c.id, "해지"),
        ];
      }),
    );
  };
  $("#search").oninput = $("#status").onchange = draw;
  draw();
  if(typeof bindCardBilling==='function')bindCardBilling();
  $("#card-chart-month").value=monthNow();
  $("#card-chart-month").onchange=run(drawCardChart);
  await drawCardChart();
  if(typeof initKbBenefits==='function')await initKbBenefits();
}

async function renderPage() { await cards(); }

async function drawCardChart() {
  const month=$("#card-chart-month").value;
  if(!month)return;
  const [year,m]=month.split("-").map(Number), last=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
  const rows=await api("/transactions?from="+month+"-01&to="+last);
  const selected=new Set(own(state.cards).map(c=>String(c.id)));
  $("#card-chart").innerHTML=lineChart(transactionPoints(rows.filter(e=>selected.has(String(e.cardId))),"EXPENSE",month+"-01",last),"카드 사용액");
}
