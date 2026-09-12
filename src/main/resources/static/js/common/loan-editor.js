// common/loan-editor.js — 여러 화면에서 사용하는 공통 기능입니다.
function editLoan(l) {
  const v = l || {
    ownerCode: "HUSBAND",
    repaymentType: "ANNUITY",
    status: "ACTIVE",
    paymentDay: 1,
  };
  modal(
    l ? "대출 수정" : "대출 초기등록",
    `<div class="fields">${field("loanName", "대출명", v.loanName, "text", "required")}${enumField("ownerCode", "소유자", "OwnerCode", v.ownerCode)}${moneyField("initialAmount", "최초 대출금액", v.initialAmount)}${moneyField("currentBalance", "현재 대출잔액", v.currentBalance)}${field("interestRate", "현재 금리 (%)", v.interestRate || 0, "number", 'min="0" step="0.00000001" required')}${field("maturityDate", "만기일", v.maturityDate, "date", "required")}${enumField("repaymentType", "상환방식", "RepaymentType", v.repaymentType)}${field("paymentDay", "월 상환일", v.paymentDay, "number", 'min="1" max="31" required')}${select("accountId", "출금계좌", accountOpts(v.accountId, true))}</div>`,
    () =>
      api("/loans" + (l ? "/" + l.id : ""), l ? "PUT" : "POST", {
        ...v,
        ...formData($("#modal-body")),
      }),
  );
  if (l) {
    $("[name=ownerCode]").disabled = true;
    $("[name=currentBalance]").readOnly = true;
    $("[name=interestRate]").readOnly = true;
  }
}
async function loanDetail(id) {
  const l = state.loans.find((x) => eq(x.id, id)),
    [schedule, paid, rates] = await Promise.all([
      api("/loans/" + id + "/schedule"),
      api("/loans/" + id + "/repayments"),
      api("/loans/" + id + "/rates"),
    ]);
  modal(
    l.loanName,
    detailGrid({
      "현재 잔액": krw(l.currentBalance),
      "현재 금리": fmt(l.interestRate) + "%",
      만기일: l.maturityDate,
      상환방식: label("RepaymentType", l.repaymentType),
      출금계좌: accName(l.accountId),
    }) +
      '<div class="toolbar" id="loan-actions"></div><h3>예상 상환 스케줄</h3><p class="muted">월 금리와 남은 상환 횟수 기준 예상치입니다. 실제 출금 시 원금·이자를 확인해주세요.</p>' +
      table(
        ["예정일", "원금", "이자", "총 상환액", "상환 후 잔액"],
        schedule.map((s) => [
          s.date,
          krw(s.principal),
          krw(s.interest),
          krw(s.total),
          krw(s.balance),
        ]),
      ) +
      "<h3>실제 상환이력</h3>" +
      table(
        ["상환일", "유형", "원금", "이자", "수수료"],
        paid.map((p) => [
          p.payment_date,
          p.early ? "중도상환" : "정기상환",
          krw(p.principal),
          krw(p.interest),
          krw(p.fee),
        ]),
      ) +
      "<h3>금리 변경 이력</h3>" +
      table(
        ["적용일", "이전 금리", "변경 금리"],
        rates.map((r) => [
          r.effective_date,
          fmt(r.old_rate) + "%",
          fmt(r.new_rate) + "%",
        ]),
      ),
    null,
  );
  $("#loan-actions").append(
    button("정기상환 기록", () => repaymentModal(l, false, schedule[0])),
    button("중도상환", () => repaymentModal(l, true)),
    button("금리 변경", () =>
      modal(
        "금리 변경",
        `<div class="fields">${field("effectiveDate", "적용일", today(), "date", "required")}${field("rate", "변경 금리 (%)", l.interestRate, "number", 'min="0" step="0.00000001" required')}</div>`,
        () =>
          api("/loans/" + id + "/rates", "POST", formData($("#modal-body"))),
      ),
    ),
  );
}
function repaymentModal(l, early, s) {
  modal(
    early ? "중도상환" : "정기상환 기록",
    `<div class="fields">${field("date", "실제 상환일", today(), "date", "required")}${moneyField("principal", "상환 원금", s?.principal || "")}${moneyField("interest", "실제 이자", s?.interest || "0")}${moneyField("fee", "중도상환수수료", 0)}${select("accountId", "출금계좌", accountOpts(l.accountId, true))}</div>`,
    () =>
      api("/loans/" + l.id + "/repayments", "POST", {
        ...formData($("#modal-body")),
        early,
      }),
  );
}
