// pages/snapshots.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function snapshots() {
  const rows = await api("/snapshots?owner=" + state.owner);
  pageTemplate();
  $("#trend-controls").innerHTML=trendControls();
  const options=rows.map(r=>`<option value="${r.id}">${esc(snapshotTime(r.captured_at))} (#${r.id})</option>`).join("");
  $("#snap-before").innerHTML=options; $("#snap-after").innerHTML=options;
  if(rows.length) $("#snap-after").value=rows.at(-1).id;
  $("#snapshot-list").innerHTML=table(["저장 시각","총자산","총부채","순자산","갱신 결과","상세"],[...rows].reverse().map(r=>[esc(snapshotTime(r.captured_at)),krw(r.total_assets),krw(r.total_debts),krw(r.net_assets),esc(r.sync_status),action("snapshot-detail",r.id,"상세")]));
  $("#compare").onclick = run(async () => {
    if (!rows.length) return;
    const owner = state.owner, container = $("#comparison");
    const from = rows.find(r => eq(r.id, $("#snap-before").value));
    const to = rows.find(r => eq(r.id, $("#snap-after").value));
    const [before, after] = await Promise.all([from, to].map(r => api("/snapshots/" + r.id)));
    if (owner !== state.owner || container !== $("#comparison") ||
        !eq(from.id, $("#snap-before").value) || !eq(to.id, $("#snap-after").value)) return;
    container.innerHTML = snapshotChangesHtml(before, after, owner, "net_assets", from, to);
  });
  await bindTrend();
}
async function snapshotDetail(id) {
  const rows = await api("/snapshots/" + id);
  modal(
    "스냅샷 #" + id,
    table(
      ["유형", "항목", "소유자", "원화 금액", "수량 / USD / 환율"],
      rows
        .filter((r) => state.owner === "JOINT" || r.owner_code === state.owner)
        .map((r) => {
          const d = JSON.parse(r.details);
          return [
            { ACCOUNT: "자산", LOAN: "대출", POSITION: "보유종목" }[
              r.item_type
            ],
            esc(d.accountName || d.loanName || d.name),
            label("OwnerCode", r.owner_code),
            krw(r.amount_krw),
            r.item_type === "POSITION"
              ? `${fmt(d.quantity)}주 / ${money(d.valueNative, d.currencyCode)} / 환율 ${krw(d.exchangeRate)}`
              : d.assetType === "SECURITIES"
                ? `예수금 $${fmt(d.depositUsd)} / 환율 ${krw(d.exchangeRate)}`
                : "—",
          ];
        }),
    ),
    null,
  );
}

async function renderPage() { await snapshots(); }
