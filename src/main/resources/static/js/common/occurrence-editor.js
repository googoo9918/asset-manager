async function confirmOccurrence(id) {
  const o = await api("/occurrences/" + id);
  if (!o) throw new Error("예정 거래를 찾을 수 없습니다.");
  if (o.state !== "PENDING") {
    modal(
      o.title,
      detailGrid({
        예정일: o.dueDate,
        상태: o.state === "COMPLETED" ? "완료" : "취소",
        "실제 처리일": o.actualDate,
        "실제 금액": o.actualAmount ? krw(o.actualAmount) : "—",
      }),
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
  if (o.planType === "CARD_PAYMENT") {
    const [installments, schedules] = await Promise.all([api("/installments"), api("/installment-schedules")]);
    const rows = schedules.filter(s => s.state === "PENDING" && s.dueDate.slice(0,7) === o.dueDate.slice(0,7)
      && installments.some(x => x.active && eq(x.id,s.installmentId) && eq(x.cardId,o.cardId)));
    const detail = document.createElement("div");
    detail.innerHTML = `<p class="muted">실제 총 출금액을 입력하세요. 아래 할부 전액이 포함된 납부로 처리하며, 일반 사용액은 이 목록에 포함되지 않습니다.</p>` +
      table(["포함된 할부", "이번 회차 금액"], rows.map(s => [esc(installments.find(x => eq(x.id,s.installmentId))?.memo || "기존 할부"), krw(s.amount)]));
    $("#modal-body").append(detail);
    $("[name=amount]").value = "";
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


