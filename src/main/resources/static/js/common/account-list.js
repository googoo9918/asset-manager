// common/account-list.js — 여러 화면에서 사용하는 공통 기능입니다.
async function accounts(type) {
  pageTemplate();
  $("#reorder").onclick=run(()=>openOrder(type));
  $("#trend-controls").innerHTML=trendControls();
  $("#trend-metric").value=type;
  $("#trend-metric").hidden=true;
  $("#new").onclick = () => editAccount(null, type);
  const draw = () => {
    const q = $("#search").value.toLowerCase(),
      status = $("#status").value;
    const rows = own(state.accounts).filter(
      (a) =>
        a.assetType === type &&
        (status === "ALL" || a.status === status) &&
        `${a.accountName} ${a.accountNumber}`.toLowerCase().includes(q),
    );
    const total = sum(
      own(state.accounts)
        .filter((a) => a.assetType === type)
        .map((a) => a.currentBalanceKrw),
    );
    $("#list").innerHTML = table(
      [
        "계좌명",
        "금융기관",
        "소유자",
        "현재 잔액",
        "유형 내 비중",
        "상태",
        "관리",
      ],
      rows.map((a) => [
        esc(a.accountName),
        label("FinancialInstitution", a.institutionCode),
        label("OwnerCode", a.ownerCode),
        krw(a.currentBalanceKrw),
        pct(a.currentBalanceKrw, total) + "%",
        label("AssetStatus", a.status),
        action("account-detail", a.id, "상세") +
          (a.status==="ACTIVE"&&!a.kisLinked?action("account-adjust",a.id,"잔액 보정"):"")+
          action("account-edit", a.id, "수정") +
          action("account-close", a.id, "해지"),
      ]),
    );
  };
  $("#search").oninput = $("#status").onchange = draw;
  draw();
  await bindTrend();
}
