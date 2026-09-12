// common/core.js — 여러 화면에서 사용하는 공통 기능입니다.
"use strict";
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ctx = document.body.dataset.context || "",
  path = location.pathname.slice(ctx.length) || "/",
  page = path.slice(1) || "dashboard";
const names = {
  dashboard: "대시보드",
  assets: "전체 자산 요약",
  cash: "현금성 자산",
  savings: "적금",
  securities: "증권",
  cards: "카드",
  loans: "대출",
  transactions: "거래내역",
  planned: "예정 거래",
  snapshots: "자산 스냅샷",
  settings: "설정",
};
const state = {
  meta: {},
  accounts: [],
  cards: [],
  loans: [],
  categories: [],
  owner:
    sessionStorage.getItem("owner:" + page) ||
    sessionStorage.getItem("lastOwner") ||
    "JOINT",
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
const monthNow = () => today().slice(0, 7),
  eq = (a, b) => String(a) === String(b);
const decimal = (v) => {
  const [a, b = ""] = String(v ?? 0).split(".");
  const sign = a.startsWith("-") ? -1n : 1n;
  return (
    sign *
    (BigInt(a.replace("-", "") || 0) * 100000000n +
      BigInt((b + "00000000").slice(0, 8)))
  );
};
const decimalString = (n) =>
  `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100000000n}.${String((n < 0n ? -n : n) % 100000000n).padStart(8, "0")}`;
const sum = (values) =>
  decimalString(values.reduce((a, b) => a + decimal(b), 0n));
const mul = (a, b) => decimalString((decimal(a) * decimal(b)) / 100000000n);
const sub = (a, b) => decimalString(decimal(a) - decimal(b));
const fmt = (v) => {
  const n = decimal(v),
    a = n < 0n ? -n : n;
  return (
    (n < 0n ? "-" : "") +
    (a / 100000000n).toLocaleString("ko-KR") +
    (a % 100000000n
      ? "." +
        String(a % 100000000n)
          .padStart(8, "0")
          .replace(/0+$/, "")
      : "")
  );
};
// 원화는 화면에서만 원 단위 반올림한다. DB 금액과 소수 수량의 정밀도는 유지한다.
const krw = (v) => {
  const n = decimal(v), a = n < 0n ? -n : n;
  const rounded = (a + 50000000n) / 100000000n;
  return (n < 0n && rounded !== 0n ? "-" : "") + rounded.toLocaleString("ko-KR") + "원";
};
const money = (v, currency = "KRW") => currency === "KRW" ? krw(v) : "$" + fmt(v);
// 가중평균 평단가는 매입원가 합계 / 수량 합계. 금액 계산에는 BigInt 고정소수점을 쓴다.
const div = (a, b) => decimal(b) === 0n ? "0" : decimalString(decimal(a) * 100000000n / decimal(b));
function preference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const pct = (a, b) =>
  decimal(b) === 0n
    ? "0.0"
    : (Number((decimal(a) * 1000n) / decimal(b)) / 10).toFixed(1);
const label = (type, code) =>
  ((type === "OwnerCode" || type === "Attribution") && ({HUSBAND:"동구", WIFE:"윱니", JOINT:"공동"})[code]) ||
  (state.meta[type] || []).find((x) => x.code === code)?.label || code || "—";
const acc = (id) => state.accounts.find((x) => eq(x.id, id));
const card = (id) => state.cards.find((x) => eq(x.id, id));
const accName = (id) => acc(id)?.accountName || "—";
const catName = (id) => state.categories.find((x) => eq(x.id, id))?.name || "—";
const own = (rows) =>
  rows.filter((x) => state.owner === "JOINT" || x.ownerCode === state.owner);
async function api(url, method = "GET", body) {
  const r = await fetch(ctx + "/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let e;
    try {
      e = await r.json();
    } catch {}
    throw new Error(e?.message || `요청 실패 (${r.status})`);
  }
  return r.status === 204 ? null : r.json();
}
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").className = error ? "error" : "";
}
const run =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notice(e.message, true);
    }
  };
function button(text, fn, cls = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.className = cls;
  b.onclick = run(fn);
  return b;
}
function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? "—"}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}" class="empty">등록된 내역이 없습니다.</td></tr>`}</tbody></table></div>`;
}
const action = (kind, id, text) =>
  `<button type="button" data-action="${kind}" data-id="${id}">${text}</button>`;
function panel(title, body) {
  return `<section class="panel"><h2>${esc(title)}</h2>${body}</section>`;
}
function bars(groups, total, date = "조회일 " + today()) {
  return (
    Object.entries(groups)
      .map(
        ([name, amount]) =>
          `<div class="bar-row" ${tipAttrs(date, amount, label("AssetType",name))}><span>${esc(label("AssetType", name))}</span><div class="track"><i style="width:${Math.max(0, Math.min(100, Number(pct(amount, total))))}%"></i></div><span>${krw(amount)} <small>(${pct(amount, total)}%)</small></span></div>`,
      )
      .join("") || '<p class="empty">내역이 없습니다.</p>'
  );
}
function metrics(s) {
  return `<div class="metrics">${[
    ["순자산", s.net],
    ["총자산", s.assets],
    ["총부채", s.debts],
  ]
    .map(
      ([k, v]) =>
        `<div class="metric"><span>${k}</span><b>${krw(v)}</b></div>`,
    )
    .join("")}</div>`;
}
function opts(type, value, empty = false) {
  return (
    (empty ? '<option value="">선택</option>' : "") +
    (state.meta[type] || [])
      .map(
        (v) =>
          `<option value="${esc(v.code)}" ${v.code === value ? "selected" : ""}>${esc(label(type, v.code))}</option>`,
      )
      .join("")
  );
}
function accountOpts(value, onlyCash = false) {
  return (
    '<option value="">선택</option>' +
    state.accounts
      .filter(
        (a) => a.status === "ACTIVE" && (!onlyCash || a.assetType === "CASH"),
      )
      .map(
        (a) =>
          `<option value="${a.id}" ${eq(value, a.id) ? "selected" : ""}>${esc(a.accountName)} · ${label("OwnerCode", a.ownerCode)} (${krw(a.currentBalanceKrw)})</option>`,
      )
      .join("")
  );
}
function field(name, title, value = "", type = "text", extra = "") {
  return `<label class="field">${esc(title)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function select(name, title, options) {
  return `<label class="field">${esc(title)}<select name="${name}">${options}</select></label>`;
}
const enumField = (name, title, type, value) =>
  select(name, title, opts(type, value));
const moneyField = (name, title, value = "", required = true) =>
  field(
    name,
    title,
    value,
    "number",
    `step="0.01" ${required ? "required" : ""}`,
  );
function formData(root) {
  const data = {};
  $$("input[name],select[name],textarea[name]", root).forEach((e) => {
    if (!e.disabled)
      data[e.name] =
        e.type === "checkbox" ? e.checked : e.value === "" ? null : e.value;
  });
  return data;
}
let submitModal = null;
function modal(title, html, onSave) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal-error").textContent = "";
  $("#save-modal").hidden = !onSave;
  $("#save-modal").disabled = false;
  submitModal = onSave;
  if (!$("#modal").open) $("#modal").showModal();
}
$("#close-modal").onclick = $("#cancel-modal").onclick = () =>
  $("#modal").close();
$("#editor").onsubmit = async (e) => {
  e.preventDefault();
  if (!submitModal) return;
  $("#save-modal").disabled = true;
  try {
    await submitModal();
    $("#modal").close();
    await loadBase();
    await render();
    notice("저장했습니다.");
  } catch (err) {
    $("#modal-error").textContent = err.message;
  } finally {
    $("#save-modal").disabled = false;
  }
};
async function loadBase() {
  [state.meta, state.accounts, state.cards, state.loans, state.categories] =
    await Promise.all(
      ["/metadata", "/accounts", "/cards", "/loans", "/categories"].map((u) =>
        api(u),
      ),
    );
}
async function render() {
  const el = $("#content");
  el.setAttribute("aria-busy", "true");
  try {
    await renderPage();
  } finally {
    el.setAttribute("aria-busy", "false");
  }
}
function detailGrid(data) {
  return `<dl class="detail-grid">${Object.entries(data)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("")}</dl>`;
}

/** JSP owns each page's structure. Re-render restores its server-delivered template before inserting API data. */
function pageTemplate() {
  $("#content").replaceChildren($("#page-template").content.cloneNode(true));
}

// USD 금액도 표시 시에만 소수 둘째 자리로 반올림한다. 수량/수익률 계산에는 원본 값을 사용한다.
function usdFormat(value) {
  const n=decimal(value), a=n<0n?-n:n, cents=(a+500000n)/1000000n;
  return (n<0n&&cents!==0n?"-":"")+(cents/100n).toLocaleString("en-US")+"."+String(cents%100n).padStart(2,"0");
}

// 계좌 상세/카드 상세/거래 화면이 공유하는 거래내역 표.
function entryTable(rows, manage = false) {
  return table(
    [
      "날짜",
      "성격",
      "금액",
      "귀속",
      "카테고리",
      "메모",
      ...(manage ? ["관리"] : []),
    ],
    rows.map((e) => [
      esc(e.transactionDate),
      label("TransactionType", e.transactionType) + (e.voided ? " (취소)" : ""),
      krw(e.amount),
      label("Attribution", e.attribution),
      esc(catName(e.categoryId)),
      esc(e.memo),
      ...(manage
        ? [
            action("entry-detail", e.id, "상세") +
              (!e.voided && e.origin === "MANUAL"
                ? action("entry-edit", e.id, "수정") +
                  action("entry-cancel", e.id, "취소")
                : ""),
          ]
        : []),
    ]),
  );
}
