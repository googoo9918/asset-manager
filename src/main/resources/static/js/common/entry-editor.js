// common/entry-editor.js — 여러 화면에서 사용하는 공통 기능입니다.
function categoryFields(type, id) {
  const c = state.categories.find((x) => eq(x.id, id)),
    parent = c?.parentId || c?.id;
  const major = state.categories.filter(
    (x) => x.active && x.transactionType === type && !x.parentId,
  );
  return `<div class="field"><label>대분류<select name="majorId"><option value="">선택</option>${major.map((x) => `<option value="${x.id}" ${eq(parent, x.id) ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label><button type="button" data-add-category="major">대분류 추가</button></div><div class="field"><label>소분류<select name="categoryId"></select></label><button type="button" data-add-category="minor">소분류 추가</button></div>`;
}
function bindCategory(root, type, id) {
  const major = $("[name=majorId]", root),
    minor = $("[name=categoryId]", root);
  const fill = () => {
    minor.innerHTML =
      '<option value="">대분류로 기록</option>' +
      state.categories
        .filter((x) => x.active && eq(x.parentId, major.value))
        .map((x) => `<option value="${x.id}">${esc(x.name)}</option>`)
        .join("");
  };
  major.onchange = fill;
  fill();
  if (id) minor.value = id;
  $$("[data-add-category]", root).forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const isMinor = b.dataset.addCategory === "minor";
          if (isMinor && !major.value)
            throw new Error("대분류를 먼저 선택해주세요.");
          const name = await uiPrompt(
            isMinor ? "추가할 소분류 이름" : "추가할 대분류 이름",
          );
          if (!name) return;
          const c = await api("/categories", "POST", {
            name,
            transactionType: type,
            parentId: isMinor ? major.value : null,
            active: true,
          });
          state.categories.push(c);
          if (!isMinor) {
            major.add(new Option(c.name, c.id));
            major.value = c.id;
          }
          fill();
          if (isMinor) minor.value = c.id;
        } catch (e) {
          $("#modal-error").textContent = e.message;
        }
      }),
  );
}
function editEntries(type, existing) {
  const defaults = {
    transactionDate: today(),
    transactionType: type,
    amount: "",
    attribution: type === "INCOME" ? "" : "JOINT",
    paymentMethod: "ACCOUNT",
    installmentMonths: 1,
  };
  modal(
    existing
      ? "거래 수정 (원본 보존)"
      : label("TransactionType", type) + " 다건 등록",
    '<div id="entry-cards"></div><div id="add-entry"></div>',
    () => {
      const entries = $$(".entry-card").map((r) => {
        const x = formData(r);
        x.transactionType = type;
        x.categoryId = x.categoryId || x.majorId;
        delete x.majorId;
        delete x.installmentMode;
        if (type === "INCOME" && !x.attribution)
          throw new Error("수입 귀속을 직접 선택해주세요.");
        return x;
      });
      return existing
        ? api("/transactions/" + existing.id, "PUT", entries[0])
        : api("/transactions/batch", "POST", { entries });
    },
  );
  const add = (v) => {
    const div = document.createElement("div");
    div.className = "entry-card";
    div.innerHTML = `<h3>${label("TransactionType", type)} ${$$(".entry-card").length + 1}</h3><div class="fields">${field("transactionDate", "날짜", v.transactionDate, "date", "required")}${moneyField("amount", "금액 (원)", v.amount)}${select("attribution", "귀속", opts("Attribution", v.attribution, type === "INCOME"))}${type !== "TRANSFER" ? categoryFields(type, v.categoryId) : ""}${type === "EXPENSE" ? enumField("paymentMethod", "결제수단", "PaymentMethod", v.paymentMethod) : ""}<div class="field" data-from>${select("sourceAccountId", "출금 / 출발 계좌", accountOpts(v.sourceAccountId))}</div><div class="field" data-to>${select("targetAccountId", "입금 / 도착 계좌", accountOpts(v.targetAccountId))}</div>${type === "EXPENSE" ? `<div class="field" data-card>${select("cardId", "카드", "")}</div><div class="field" data-installment>${select("installmentMode", "결제 방식", `<option value="1">일시불</option><option value="N" ${v.installmentMonths > 1 ? "selected" : ""}>할부</option>`)}${field("installmentMonths", "할부 개월", v.installmentMonths || 1, "number", 'min="1" max="120"')}</div>` : ""}<label class="field full">메모<textarea name="memo" maxlength="1000">${esc(v.memo)}</textarea></label></div>`;
    $("#entry-cards").append(div);
    if (type !== "TRANSFER") bindCategory(div, type, v.categoryId);
    const sync = () => {
      const method = $("[name=paymentMethod]", div)?.value;
      const from =
          type === "TRANSFER" || (type === "EXPENSE" && method === "ACCOUNT"),
        to = type !== "EXPENSE";
      $("[data-from]", div).hidden = !from;
      $("[name=sourceAccountId]", div).disabled = !from;
      $("[data-to]", div).hidden = !to;
      $("[name=targetAccountId]", div).disabled = !to;
      if (type === "EXPENSE") {
        const useCard = method !== "ACCOUNT";
        $("[data-card]", div).hidden = !useCard;
        const cs = $("[name=cardId]", div),
          last = cs.value || v.cardId;
        cs.disabled = !useCard;
        cs.innerHTML =
          '<option value="">선택</option>' +
          state.cards
            .filter((c) => c.status === "ACTIVE" && c.cardType === method)
            .map((c) => `<option value="${c.id}">${esc(c.cardName)}</option>`)
            .join("");
        cs.value = last || "";
        $("[data-installment]", div).hidden = method !== "CREDIT";
        const ins = $("[name=installmentMonths]", div);
        ins.hidden = $("[name=installmentMode]", div).value !== "N";
        if (
          method !== "CREDIT" ||
          $("[name=installmentMode]", div).value === "1"
        )
          ins.value = 1;
      }
    };
    if (type === "EXPENSE") {
      $("[name=paymentMethod]", div).onchange = sync;
      $("[name=installmentMode]", div).onchange = sync;
    }
    sync();
    if (!existing) {
      const remove = button("이 거래 제거", () => {
        if ($$(".entry-card").length > 1) div.remove();
      });
      div.append(remove);
    }
  };
  add(existing || { ...defaults });
  if (!existing)
    $("#add-entry").append(button("+ 거래 추가", () => add({ ...defaults })));
}
async function manageCategories() {
  modal(
    "카테고리 관리",
    table(
      ["구분", "이름", "상위", "상태", "관리"],
      state.categories.map((c) => [
        label("TransactionType", c.transactionType),
        esc(c.name),
        esc(catName(c.parentId)),
        c.active ? "사용중" : "비활성",
        !c.systemCode
          ? action("category-edit", c.id, "수정") +
            action("category-disable", c.id, "비활성화")
          : "기본 코드",
      ]),
    ),
    null,
  );
}
