// common/card-editor.js — 여러 화면에서 사용하는 공통 기능입니다.
function editCard(c) {
  const v = c || {
    ownerCode: "HUSBAND",
    cardType: "CREDIT",
    status: "ACTIVE",
    paymentDay: 1,
  };
  modal(
    c ? "카드 수정" : "카드 등록",
    `<div class="fields">${field("cardName", "카드명", v.cardName, "text", "required")}${enumField("ownerCode", "소유자", "OwnerCode", v.ownerCode)}${enumField("cardType", "카드 유형", "CardType", v.cardType)}${select("accountId", "연결 결제계좌", accountOpts(v.accountId, true))}${field("paymentDay", "결제일", v.paymentDay, "number", 'min="1" max="31"')}</div>`,
    () =>
      api("/cards" + (c ? "/" + c.id : ""), c ? "PUT" : "POST", {
        ...v,
        ...formData($("#modal-body")),
      }),
  );
  $("[name=cardType]").onchange = () => {
    $("[name=paymentDay]").disabled = $("[name=cardType]").value === "DEBIT";
  };
  $("[name=cardType]").onchange();
  if (c) {
    $("[name=cardType]").disabled = true;
    $("[name=ownerCode]").disabled = true;
  }
}
async function cardDetail(id) {
  const c = card(id),
    [es, ps, ii, occ, schedules] = await Promise.all([
      api("/transactions"),
      api("/cards/" + id + "/payments"),
      api("/installments"),
      api("/occurrences?month=" + monthNow()),
      api("/installment-schedules"),
    ]);
  modal(
    c.cardName,
    detailGrid({
      유형: label("CardType", c.cardType),
      결제계좌: accName(c.accountId),
      결제일: c.paymentDay || "해당 없음",
    }) +
      `<div class="toolbar" id="card-actions"></div><h3>이번 결제 예정</h3>` +
      table(
        ["일정", "포함된 기존 할부", "상태", "처리"],
        occ
          .filter((o) => eq(o.cardId, id))
          .map((o) => [
            o.actualDate || o.dueDate,
            o.amount ? krw(o.amount) : "—",
            { PENDING: "입력 필요", COMPLETED: "완료", CANCELLED: "취소" }[
              o.state
            ],
            o.state === "PENDING"
              ? action("occurrence-confirm", o.id, "실제 출금액 입력")
              : "—",
          ]),
      ) +
      `<h3>카드 사용내역</h3>` +
      entryTable(es.filter((e) => eq(e.cardId, id))) +
      `<h3>카드대금 출금 이력</h3>` +
      table(
        ["출금일", "금액", "기준"],
        ps.map((p) => [p.payment_date, krw(p.amount), p.grouped ? "결제 계좌 전체 총액 (이 카드 포함)" : "카드별 출금"]),
      ) +
      `<h3>기존 할부</h3><p class="muted">매월 카드 결제 예정에 포함됩니다. 결제 확정 시 해당 월의 할부 회차가 자동 차감됩니다.</p>` +
      table(
        ["잔여 개월", "잔여 총액", "메모", "상태", "관리"],
        ii
          .filter((x) => eq(x.cardId, id))
          .map((x) => [
            x.remainingMonths,
            krw(x.remainingAmount),
            esc(x.memo),
            x.remainingMonths === 0 ? "완납" : x.active ? "납부 중" : "비활성",
            (x.active && !schedules.some(s => eq(s.installmentId, x.id) && s.state === "PAID") ? action("installment-edit", x.id, "수정") : "") +
              (x.active ? action("installment-disable", x.id, "비활성화") : "—"),
          ]),
      ) + `<h3>할부 회차별 예정·납부 이력</h3>` + table(
        ["할부", "결제월", "금액", "상태", "실제 납부일"],
        schedules.filter(s => s.state !== "CANCELLED" && ii.some(x => eq(x.id,s.installmentId) && eq(x.cardId,id)))
          .map(s => [esc(ii.find(x => eq(x.id,s.installmentId))?.memo || "기존 할부"), s.dueDate.slice(0,7), krw(s.amount), s.state === "PAID" ? "납부 완료" : "예정", s.paidDate || "—"])),
    null,
  );
  if (c.cardType === "CREDIT") {
    $("#card-actions").append(
      button("기존 할부 등록", () => editInstallment(null, id)),
    );
    $("#card-actions").append(
      button("카드대금 납부", () => paymentModal(id)),
    );
  }
}
function paymentModal(id) {
  modal(
    "실제 카드대금 출금",
    `<p class="muted">선택한 결제월의 예정과 기존 할부를 함께 완료합니다. 실제 총 출금액에 해당 월 할부 전액이 포함되어 있어야 합니다. 출금일이 달라도 결제월을 기준으로 차감합니다.</p><div class="fields">${field("billingMonth", "결제월", monthNow(), "month", "required")}${field("date", "실제 출금일", today(), "date", "required")}${moneyField("amount", "실제 총 출금액")}</div>`,
    async () => {
      const r = formData($("#modal-body"));
      return api("/cards/" + id + "/payments", "POST", r);
    },
  );
}
function editInstallment(x, cardId) {
  const v = x || { cardId, active: true };
  const c = card(v.cardId);
  const due = month => {
    const [year, m] = month.split("-").map(Number);
    return month + "-" + String(Math.min(c.paymentDay, new Date(year,m,0).getDate())).padStart(2,"0");
  };
  let first = due(monthNow());
  if (first < today()) {
    const [y,m] = monthNow().split("-").map(Number);
    first = due(`${m === 12 ? y+1 : y}-${String(m === 12 ? 1 : m+1).padStart(2,"0")}`);
  }
  modal(
    "기존 할부",
    `<p class="muted">잔여 총액을 잔여 개월로 나누어 매월 카드 결제 예정에 연결합니다. 나눗셈의 차액은 마지막 회차에 포함됩니다. 납부 확정 시 잔액과 개월이 자동으로 줄어듭니다.</p><div class="fields">${field("firstPaymentDate", "첫 결제일 (카드 결제일)", v.firstPaymentDate || first, "date", "required")}${field("remainingMonths", "잔여 개월", v.remainingMonths || 1, "number", 'min="1" max="120" required')}${moneyField("remainingAmount", "잔여 총액", v.remainingAmount)}${field("memo", "메모", v.memo)}</div>`,
    () =>
      api("/installments" + (x ? "/" + x.id : ""), x ? "PUT" : "POST", {
        ...v,
        ...formData($("#modal-body")),
      }),
  );
}
