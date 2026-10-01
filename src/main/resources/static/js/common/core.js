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
  review: "확인할 내역",
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
  // BigDecimal JSON and historical snapshots can contain 0E-8 or 1.2E+7.
  // Shift decimal digits as text; converting the amount to Number would lose precision.
  const text=String(v??0).trim();
  if(!text)return 0n;
  const match=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if(!match||!(match[2]||match[3]))throw new Error("금액 형식을 확인해주세요.");
  const digits=(match[2]+(match[3]||"")).replace(/^0+/,"");
  if(!digits)return 0n;
  const exponent=Number(match[4]||0);
  if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>10000)throw new Error("금액의 지수 범위를 확인해주세요.");
  const shift=8+exponent-(match[3]||"").length;
  const amount=shift>=0?BigInt(digits)*10n**BigInt(shift):BigInt(digits.slice(0,Math.max(0,digits.length+shift))||"0");
  return match[1]==="-"?-amount:amount;
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
  let r;
  try {r = await fetch(ctx + "/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });} catch {throw new Error(method==="GET"?"서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 조회해주세요.":"요청 결과를 확인하지 못했습니다. 저장·주문 내역을 확인한 뒤 다시 진행해주세요.");}
  if (!r.ok) {
    let e;
    try {
      e = await r.json();
    } catch {}
    throw new Error(e?.message || `요청 실패 (${r.status})`);
  }
  if (r.status === 204) return null;
  const text = await r.text();
  return text.trim() ? JSON.parse(text) : null;
}
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").className = error ? "error" : "";
  $("#notice").setAttribute("role",error?"alert":"status");
}
const run =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notice(e.message, true);
      if($("#modal").open){$("#modal-error").textContent=e.message;$("#modal-error").focus();}
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
function table(headers, rows, mobileColumns=null) {
  const cards=Array.isArray(mobileColumns);
  return `<div class="table-wrap${cards?' record-table':''}"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}${cards?'<th class="record-toggle-cell">추가 정보</th>':''}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c,i) => `<td class="${["메모","안내"].includes(headers[i])?'cell-note ':''}${cards&&!mobileColumns.includes(i)?'record-extra':''}"${cards?` data-label="${esc(headers[i])}"`:''}>${c ?? "—"}</td>`).join("")}${cards?'<td class="record-toggle-cell"><button type="button" data-record-toggle aria-expanded="false">추가 정보 보기</button></td>':''}</tr>`).join("") : `<tr><td colspan="${headers.length}" class="empty"><strong>표시할 내역이 없습니다.</strong><span>조회 조건을 바꾸거나 새로운 내역을 등록해주세요.</span></td></tr>`}</tbody></table></div>`;
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
        `<div class="metric"><span>${k}</span><b>${krw(v)}</b><small>${k==="순자산"?"총자산 − 총부채":k==="총자산"?"현재 보유한 모든 자산":"남아 있는 부채 합계"}</small></div>`,
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
  $("#kb-flow-footer")?.remove();
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal-error").textContent = "";
  $("#save-modal").hidden = !onSave;
  $("#save-modal").disabled = false;
  $("#save-modal").textContent = "저장";
  $("#cancel-modal").textContent = onSave ? "취소" : "닫기";
  $("#modal").classList.toggle("dialog-wide",/table-wrap|entry-cards|kb-|snapshot-changes/.test(html));
  submitModal = onSave;
  if (!$("#modal").open) $("#modal").showModal();
  $("#modal-body").scrollTop=0;
  // Focus a deliberate starting point when replacing an already-open dialog as well.
  const focusTarget=onSave?$("#modal-body input:not([disabled]):not([type=hidden]), #modal-body select:not([disabled]), #modal-body textarea:not([disabled])"):$("#modal-title");
  focusTarget?.focus({preventScroll:true});
}
$("#close-modal").onclick = $("#cancel-modal").onclick = () =>
  $("#modal").close();
$("#editor").onsubmit = async (e) => {
  e.preventDefault();
  if (!submitModal || $("#save-modal").disabled) return;
  $("#save-modal").disabled = true;
  $("#save-modal").textContent = "저장 중…";
  $("#close-modal").disabled = $("#cancel-modal").disabled = true;
  let saved=false;
  try {
    await submitModal();
    saved=true;
    $("#modal").close();
    await loadBase();
    await render();
    notice("저장했습니다.");
  } catch (err) {
    if(saved)notice("저장은 완료되었습니다. 화면을 다시 조회해주세요. "+err.message,true);
    else {$("#modal-error").textContent = err.message;$("#modal-error").focus();}
  } finally {
    $("#save-modal").disabled = false;
    $("#save-modal").textContent = "저장";
    $("#close-modal").disabled = $("#cancel-modal").disabled = false;
  }
};
$("#modal").oncancel=e=>{if($("#save-modal").disabled&&!$("#save-modal").hidden)e.preventDefault();};
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
  $("#view-loading").hidden=false;
  try {
    await renderPage();
  } catch(e) {
    showPageError(e);
    throw e;
  } finally {
    el.setAttribute("aria-busy", "false");
    $("#view-loading").hidden=true;
  }
}
function showPageError(error) {
  $("#content").innerHTML=`<section class="panel"><div class="empty-state"><strong>화면을 불러오지 못했습니다.</strong><p>${esc(error.message)}</p><button type="button" id="screen-retry" class="primary">다시 불러오기</button></div></section>`;
  $("#screen-retry").onclick=()=>loadScreen();
}
let screenReloading=false;
async function loadScreen() {
  if(screenReloading)return;
  screenReloading=true;
  const retry=$("#screen-retry");if(retry){retry.disabled=true;retry.textContent="불러오는 중…";}
  $("#content").setAttribute("aria-busy","true");$("#view-loading").hidden=false;
  try {await loadBase();await render();notice("");}
  catch(e){showPageError(e);notice(e.message,true);}
  finally {screenReloading=false;$("#content").setAttribute("aria-busy","false");$("#view-loading").hidden=true;}
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
    [0,1,2,5,6],
  );
}
