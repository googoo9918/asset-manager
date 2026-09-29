// common/account-editor.js — 여러 화면에서 사용하는 공통 기능입니다.
function editAccount(a, type) {
  type = a?.assetType || type;
  const v = a || {
    assetType: type,
    ownerCode: state.owner === "WIFE" ? "WIFE" : "HUSBAND",
    institutionCode: type === "SECURITIES" ? "KIS" : "KB",
    currentBalanceKrw: "0",
    currencyCode: "KRW",
    status: "ACTIVE",
    kisLinked: false,
  };
  let html = `<div class="fields">${enumField("ownerCode", "소유자", "OwnerCode", v.ownerCode)}${enumField("institutionCode", "금융기관", "FinancialInstitution", v.institutionCode)}${field("accountName", type === "SAVINGS" ? "상품명" : "계좌명", v.accountName, "text", 'required maxlength="100"')}${field("accountNumber", "계좌번호 전체", v.accountNumber, "text", 'required maxlength="60"')}${moneyField("currentBalanceKrw", a ? "현재 잔액 (보정 메뉴에서 변경)" : "초기 잔액 (원)", v.currentBalanceKrw)}${enumField("status", "상태", "AssetStatus", v.status)}`;
  if (type === "SECURITIES")
    html += `<label class="field">KIS 연동<input type="checkbox" name="kisLinked" ${v.kisLinked ? "checked" : ""}></label>`;
  if (type === "SAVINGS")
    html +=
      field("startDate", "가입일", v.startDate || today(), "date", "required") +
      field("maturityDate", "만기일", v.maturityDate, "date", "required") +
      field(
        "interestRate",
        "금리 (%)",
        v.interestRate || "0",
        "number",
        'step="0.00000001" min="0" required',
      ) +
      moneyField("monthlyAmount", "월 납입액", v.monthlyAmount) +
      field(
        "paymentDay",
        "월 납입일",
        v.paymentDay || 1,
        "number",
        'min="1" max="31" required',
      ) +
      select(
        "withdrawalAccountId",
        "출금계좌",
        accountOpts(v.withdrawalAccountId, true),
      );
  html += "</div>";
  modal(a ? "계좌 수정" : "계좌 등록", html, () => {
    const r = {
      ...v,
      ...formData($("#modal-body")),
      assetType: type,
      currencyCode: "KRW",
    };
    if (type !== "SECURITIES") r.kisLinked = false;
    if (a) r.currentBalanceKrw = a.currentBalanceKrw;
    return api("/accounts" + (a ? "/" + a.id : ""), a ? "PUT" : "POST", r);
  });
  if (a) {
    $("[name=currentBalanceKrw]").readOnly = true;
    $("[name=ownerCode]").disabled = true;
    $("[name=status]").disabled = true;
  }
}
async function accountDetail(id) {
  const a = acc(id),
    [entries, adjustments] = await Promise.all([
      api("/transactions?account=" + id),
      api("/accounts/" + id + "/adjustments"),
    ]);
  modal(
    a.accountName,
    detailGrid({
      계좌번호: a.accountNumber,
      금융기관: label("FinancialInstitution", a.institutionCode),
      소유자: label("OwnerCode", a.ownerCode),
      "현재 잔액": krw(a.currentBalanceKrw),
      상태: label("AssetStatus", a.status),
      만기일: a.maturityDate || "—",
    }) +
      `<div id="adjust-button"></div>` +
      `<h3>관련 거래</h3>` +
      entryTable(entries) +
      `<h3>잔액 보정 이력</h3>` +
      table(
        ["시각", "이전 잔액", "보정 잔액", "사유"],
        adjustments.map((x) => [
          esc(String(x.created_at)),
          krw(x.old_balance),
          krw(x.new_balance),
          esc(x.reason),
        ]),
      ),
    null,
  );
  if (a.status === "ACTIVE" && !a.kisLinked)
    $("#adjust-button").append(
      button("잔액 보정", () => adjustAccount(id)),
    );
}
function adjustAccount(id) {
  const a=acc(id);
  if(a.status!=="ACTIVE"||a.kisLinked)throw new Error("사용 중인 비연동 계좌만 잔액을 보정할 수 있습니다.");
  modal("잔액 보정 · "+a.accountName,
    `<p>현재 기록된 잔액은 <strong>${krw(a.currentBalanceKrw)}</strong>입니다. 차액이 아닌 실제 잔액을 입력하세요. 이전 잔액과 사유는 보정 이력에 남습니다.</p><div class="fields">${moneyField("balance","보정 후 실제 잔액 (원)",a.currentBalanceKrw)}${field("reason","보정 사유","","text",'required maxlength="1000"')}</div>`,
    ()=>api("/accounts/"+id+"/adjustments","POST",formData($("#modal-body"))));
}
