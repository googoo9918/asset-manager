async function confirmOccurrence(id) {
  const o = await api("/occurrences/" + id);
  if (!o) throw new Error("예정 거래를 찾을 수 없습니다.");
  if (o.paymentGroupId) return confirmOccurrence(o.paymentGroupId);
  if (o.planType === "CARD_PAYMENT" && o.state === "PENDING") return confirmCardAccount(o);
  if (o.state !== "PENDING") {
    const members = o.sourceKey?.startsWith("CARD_ACCOUNT:") ? await api("/occurrences/" + id + "/card-account-group") : [];
    modal(
      o.title,
      detailGrid({
        예정일: o.dueDate,
        상태: o.state === "COMPLETED" ? "완료" : "취소",
        "실제 처리일": o.actualDate,
        "실제 금액": o.actualAmount ? krw(o.actualAmount) : "—",
      }) + (members.length ? '<p>결제 계좌의 총 출금액입니다. 카드별 금액은 배분하지 않습니다.</p>' + table(["포함된 카드","결제월"],members.map(m=>[esc(card(m.cardId)?.cardName || "카드 #"+m.cardId),m.dueDate.slice(0,7)])) : ""),
      null,
    );
    return;
  }
  let s;
  if (o.planType === "LOAN")
    s = (
      await api(
        "/loans/" +
          o.loanId +
          "/schedule?from=" +
          (o.dueDate < today() ? o.dueDate : today()),
      )
    ).find((r) => r.date === o.dueDate);
  modal(
    o.title,
    `<p class="muted">실제 날짜와 금액을 확인한 후 확정해주세요.</p><div class="fields">${field("date", "실제 날짜", o.actualDate || o.dueDate, "date", "required")}${moneyField("amount", "실제 금액", s?.total || o.amount || "")}${o.planType === "LOAN" ? moneyField("principal", "원금", s?.principal || "") + moneyField("interest", "이자", s?.interest || "") : ""}</div><div class="toolbar" id="occurrence-actions"></div>`,
    () =>
      api(
        "/occurrences/" + id + "/confirm",
        "POST",
        formData($("#modal-body")),
      ),
  );
  if (o.planType === "LOAN") {
    const calc = () => {
      $("[name=amount]").value = sum([
        $("[name=principal]").value,
        $("[name=interest]").value,
      ]);
    };
    $("[name=principal]").oninput = $("[name=interest]").oninput = calc;
  }
  $("#occurrence-actions").append(
    button("집행하지 않고 날짜만 변경", async () => {
      await api(
        "/occurrences/" + id + "/date?date=" + $("[name=date]").value,
        "PUT",
      );
      $("#modal").close();
      await render();
    }),
    button(
      "예정 취소",
      async () => {
        if (await uiConfirm("이 예정 항목을 취소하시겠습니까?")) {
          await api("/occurrences/" + id, "DELETE");
          $("#modal").close();
          await render();
        }
      },
      "danger",
    ),
  );
}

async function confirmCardAccount(o) {
  const [rows, installments, schedules] = await Promise.all([
    api("/occurrences/"+o.id+"/card-account-group"),api("/installments"),api("/installment-schedules")]);
  if (!rows.length) throw new Error("결제 예정이 변경되었습니다. 다시 조회해주세요.");
  const accountId=rows[0].accountId, ids=rows.map(r=>r.id);
  const included=schedules.filter(s=>s.state==="PENDING" && installments.some(x=>x.active && eq(x.id,s.installmentId)
    && rows.some(r=>eq(r.cardId,x.cardId) && r.dueDate.slice(0,7)===s.dueDate.slice(0,7))));
  const payload=()=>({accountId,occurrenceIds:ids,...formData($("#modal-body"))});
  modal(accName(accountId)+" 카드대금",
    '<p>이 계좌에서 같은 날 결제되는 카드의 실제 총 출금액을 한 번 입력하세요. 포함된 할부 회차도 함께 납부 처리합니다.</p>' +
    table(["포함된 카드","결제월"],rows.map(r=>[esc(card(r.cardId)?.cardName || "카드 #"+r.cardId),r.dueDate.slice(0,7)]))+
    `<div class="fields">${field("date","실제 출금일",o.actualDate||o.dueDate,"date","required")}${moneyField("amount","계좌의 실제 총 출금액","")}</div>`+
    table(["카드","포함된 할부","이번 회차 금액"],included.map(s=>{const x=installments.find(x=>eq(x.id,s.installmentId));return [esc(card(x.cardId)?.cardName),esc(x.memo||"기존 할부"),krw(s.amount)];}))+
    `<p>포함된 할부 합계: ${krw(sum(included.map(s=>s.amount)))} · 일반 사용액을 포함한 실제 총액을 입력하세요.</p><p class="muted">할부 합계는 원 단위로 반올림합니다. 원 단위 입력 시 이 합계를 기준으로 확인하며, 계좌에서는 입력한 실제 금액만 차감합니다.</p><div class="toolbar" id="occurrence-actions"></div>`,
    ()=>api("/occurrences/card-account/confirm","POST",payload()));
  $("#occurrence-actions").append(
    button("집행하지 않고 날짜만 변경",async()=>{const r=payload();delete r.amount;await api("/occurrences/card-account/date","PUT",r);$("#modal").close();await render();}),
    button("예정 취소",async()=>{if(await uiConfirm("이 계좌의 포함된 카드 결제 예정을 모두 취소하시겠습니까?")){const r=payload();delete r.amount;await api("/occurrences/card-account/cancel","POST",r);$("#modal").close();await render();}},"danger"));
}


