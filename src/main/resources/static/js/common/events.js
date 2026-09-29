// common/events.js — 여러 화면에서 사용하는 공통 기능입니다.
async function remove(url, text) {
  if (!(await uiConfirm(text))) return;
  await api(url, "DELETE");
  $("#modal").close();
  await loadBase();
  await render();
  notice("처리했습니다. 과거 이력은 보존됩니다.");
}
document.addEventListener(
  "click",
  run(async (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.action) {
      case "account-detail":
        return accountDetail(id);
      case "account-adjust":
        return adjustAccount(id);
      case "account-edit":
        return editAccount(acc(id));
      case "account-close":
        return remove("/accounts/" + id, "계좌를 해지하시겠습니까?");
      case "card-detail":
        return cardDetail(id);
      case "card-edit":
        return editCard(card(id));
      case "card-close":
        return remove("/cards/" + id, "카드를 해지하시겠습니까?");
      case "loan-detail":
        return loanDetail(id);
      case "loan-edit":
        return editLoan(state.loans.find((l) => eq(l.id, id)));
      case "loan-close":
        return remove("/loans/" + id, "상환이 끝난 대출을 종료하시겠습니까?");
      case "entry-edit": {
        const x = await api("/transactions/" + id);
        return editEntries(x.transactionType, x);
      }
      case "entry-cancel":
        return remove(
          "/transactions/" + id,
          "거래를 취소하고 당시 반영한 계좌 잔액을 되돌리시겠습니까?",
        );
      case "entry-detail": {
        const x = await api("/transactions/" + id);
        modal(
          "거래 상세",
          detailGrid({
            날짜: x.transactionDate,
            성격: label("TransactionType", x.transactionType),
            금액: krw(x.amount),
            귀속: label("Attribution", x.attribution),
            카테고리: catName(x.categoryId),
            "출발 계좌": accName(x.sourceAccountId),
            "도착 계좌": accName(x.targetAccountId),
            카드: card(x.cardId)?.cardName,
            "할부 개월": x.installmentMonths,
            메모: x.memo,
            상태: x.voided ? "취소" : "정상",
            "등록 경로": x.origin,
          }),
          null,
        );
        return;
      }
      case "plan-edit":
        return editPlan(await api("/plans/" + id));
      case "plan-disable":
        return remove(
          "/plans/" + id,
          "반복 지출과 미처리 예정을 비활성화하시겠습니까?",
        );
      case "occurrence-confirm":
        return confirmOccurrence(id);
      case "security-detail":
        return securityDetail(id);
      case "holding-order":
        return stockOrderFromHolding(id,b.dataset.currency,b.dataset.account);
      case "daily-price-history":
        return dailyPriceHistory(id);
      case "snapshot-detail":
        return snapshotDetail(id);
      case "installment-edit":
        return editInstallment(await api("/installments/" + id));
      case "installment-disable":
        return remove(
          "/installments/" + id,
          "기존 할부 기록을 비활성화하시겠습니까?",
        );
      case "category-disable":
        return remove("/categories/" + id, "카테고리를 비활성화하시겠습니까?");
      case "category-edit": {
        const c = state.categories.find((x) => eq(x.id, id));
        modal(
          "카테고리 수정",
          field("name", "이름", c.name, "text", "required"),
          () =>
            api("/categories/" + id, "PUT", {
              ...c,
              ...formData($("#modal-body")),
            }),
        );
        return;
      }
    }
  }),
);
$("#title").textContent = names[page] || names.dashboard;
initUi();
// 미선택 버튼도 전환 가능해야 하므로 disabled 대신 aria-pressed와 색상으로 선택 상태를 전달한다.
function drawOwnerButtons() {
  $$("[data-owner]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.owner === state.owner)));
}
drawOwnerButtons();
$$("[data-owner]").forEach(b => b.onclick = run(async () => {
  if (b.dataset.owner === state.owner) return;
  // 중복 렌더링으로 서로 다른 소유자 응답이 섞이지 않도록 조회 중에만 버튼을 잠근다.
  $$("[data-owner]").forEach(x => x.disabled = true);
  try {
    state.owner = b.dataset.owner;
    sessionStorage.setItem("owner:" + page, state.owner);
    sessionStorage.setItem("lastOwner", state.owner);
    drawOwnerButtons();
    await render();
  } finally { $$("[data-owner]").forEach(x => x.disabled = false); }
}));
$$("nav a").forEach((a) =>
  a.classList.toggle("active", a.pathname === location.pathname),
);
$("#refresh").onclick = run(async () => {
  const b = $("#refresh");
  if(b.disabled)return;
  b.disabled = true;
  const original=b.textContent;b.textContent="갱신하고 저장 중…";
  let snapshotSaved=false;
  try {
    const r = await api("/refresh", "POST");
    snapshotSaved=true;
    await loadBase();
    await render();
    notice("스냅샷 #" + r.id + " 저장 · " + r.syncStatus);
  } catch(e) {
    notice(snapshotSaved?"자산 기록은 저장되었습니다. 화면 조회에 실패했으니 페이지를 새로고침해주세요. "+e.message:e.message,true);
  } finally {
    b.disabled = false;
    b.textContent=original;
  }
});
loadScreen();
