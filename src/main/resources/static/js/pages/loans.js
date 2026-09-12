// pages/loans.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function loans() {
  pageTemplate();
  $("#trend-controls").innerHTML=trendControls();
  $("#trend-metric").value="total_debts";
  $("#trend-metric").hidden=true;
  $("#new").onclick = () => editLoan();
  const draw = () => {
    $("#list").innerHTML = table(
      [
        "대출명",
        "소유자",
        "현재 잔액",
        "현재 금리",
        "만기일",
        "상환방식",
        "관리",
      ],
      own(state.loans)
        .filter(
          (l) =>
            ($("#status").value === "ALL" || l.status === $("#status").value) &&
            l.loanName.includes($("#search").value),
        )
        .map((l) => [
          esc(l.loanName),
          label("OwnerCode", l.ownerCode),
          krw(l.currentBalance),
          fmt(l.interestRate) + "%",
          l.maturityDate,
          label("RepaymentType", l.repaymentType),
          action("loan-detail", l.id, "상세") +
            action("loan-edit", l.id, "수정") +
            action("loan-close", l.id, "종료"),
        ]),
    );
  };
  $("#search").oninput = $("#status").onchange = draw;
  draw();
  await bindTrend();
}

async function renderPage() { await loans(); }
