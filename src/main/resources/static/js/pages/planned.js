// pages/planned.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
let calendarMonth = monthNow(),
  currentOccurrences = [];
async function planned() {
  const [plans, installments, schedules] = await Promise.all([
    api("/plans"), api("/installments"), api("/installment-schedules")]);
  currentOccurrences = await api("/occurrences?month=" + calendarMonth);
  pageTemplate();
  $("#calendar-month").value=calendarMonth;
  $("#plan-list").innerHTML=
      table(
        ["이름", "주기", "시작일", "금액", "귀속", "관리"],
        plans
          .filter(
            (p) =>
              p.active &&
              (state.owner === "JOINT" || p.attribution === state.owner),
          )
          .map((p) => [
            esc(p.title),
            label("RepeatCycle", p.repeatCycle),
            p.startDate,
            krw(p.amount),
            label("Attribution", p.attribution),
            action("plan-edit", p.id, "수정") +
              action("plan-disable", p.id, "삭제"),
          ]),
      ) + `<h3>카드에 연결된 반복 할부</h3><p class="muted">아래 할부는 달력의 카드 결제 예정에 합산됩니다. 카드대금 납부 한 번으로 해당 월 회차도 완료됩니다.</p>` + table(
        ["이름", "카드", "주기", "다음 결제월", "다음 회차 금액", "잔여 개월", "잔여 총액", "관리"],
        installments.filter(x => x.active && (state.owner === "JOINT" || card(x.cardId)?.ownerCode === state.owner))
          .map(x => {
            const next = schedules.filter(s => eq(s.installmentId,x.id) && s.state === "PENDING").sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
            return [esc(x.memo || "기존 할부"), esc(card(x.cardId)?.cardName), "매월", next?.dueDate.slice(0,7) || "—", next ? krw(next.amount) : "—", x.remainingMonths, krw(x.remainingAmount), action("card-detail",x.cardId,"카드 상세")];
          }));
  drawPlannedChart();
  $("#new-plan").onclick = () => editPlan();
  $("#calendar-month").onchange = run(async () => {
    calendarMonth = $("#calendar-month").value;
    await planned();
  });
  for (const [id, n] of [
    ["prev", -1],
    ["next", 1],
  ])
    $("#" + id).onclick = run(async () => {
      const [y, m] = calendarMonth.split("-").map(Number);
      const d = new Date(y, m - 1 + n, 1);
      calendarMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      await planned();
    });
  const [y, m] = calendarMonth.split("-").map(Number),
    first = new Date(y, m - 1, 1).getDay(),
    length = new Date(y, m, 0).getDate();
  $("#calendar").innerHTML =
    ["일", "월", "화", "수", "목", "금", "토"]
      .map((d) => `<div class="weekday">${d}</div>`)
      .join("") +
    '<div class="day"></div>'.repeat(first) +
    Array.from({ length }, (_, i) => {
      const date = calendarMonth + "-" + String(i + 1).padStart(2, "0");
      const rows = currentOccurrences.filter(
        (o) =>
          (o.actualDate || o.dueDate) === date &&
          (state.owner === "JOINT" || o.attribution === state.owner),
      );
      return `<div class="day ${date === today() ? "today" : ""}"><b>${i + 1}</b>${rows.map((o) => `<button class="${o.state === "COMPLETED" ? "done" : o.state === "CANCELLED" ? "cancelled" : ""}" data-action="occurrence-confirm" data-id="${o.id}">${esc(o.title)}<br>${o.state === "COMPLETED" ? "완료" : o.state === "CANCELLED" ? "취소" : o.amount ? krw(o.amount) : "실제 출금액 입력"}</button>`).join("")}</div>`;
    }).join("");
}
function editPlan(p) {
  const v = p || {
    planType: "EXPENSE",
    repeatCycle: "MONTHLY",
    startDate: today(),
    attribution: "JOINT",
    active: true,
  };
  modal(
    p ? "반복 지출 수정" : "반복 지출 등록",
    `<div class="fields">${field("title", "제목", v.title, "text", "required")}${enumField("repeatCycle", "반복주기", "RepeatCycle", v.repeatCycle)}${field("startDate", "시작일", v.startDate, "date", "required")}${field("endDate", "종료일 (선택)", v.endDate, "date")}${moneyField("amount", "예정 금액", v.amount)}${enumField("attribution", "귀속", "Attribution", v.attribution)}${categoryFields("EXPENSE", v.categoryId)}${select("accountId", "출금계좌", accountOpts(v.accountId))}</div>`,
    () => {
      const r = { ...v, ...formData($("#modal-body")) };
      r.categoryId = r.categoryId || r.majorId;
      delete r.majorId;
      return api("/plans" + (p ? "/" + p.id : ""), p ? "PUT" : "POST", r);
    },
  );
  bindCategory($("#modal-body"), "EXPENSE", v.categoryId);
}
async function renderPage() { await planned(); }

function drawPlannedChart() {
  const grouped=new Map();
  currentOccurrences.filter(o=>o.state==="PENDING" && o.amount != null && (state.owner==="JOINT"||o.attribution===state.owner)).forEach(o=>grouped.set(o.dueDate,sum([grouped.get(o.dueDate)||"0",o.amount])));
  $("#planned-chart").innerHTML=lineChart([...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value})),"등록된 예정금액");
}

