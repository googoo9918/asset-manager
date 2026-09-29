/** 표시 순서는 서버에 저장한다. 필터에 숨은 계좌가 누락되지 않도록 정렬 팝업은 전체 소유자를 표시한다. */
async function openOrder(scope) {
  await loadBase();
  const rows = (scope === "CARDS" ? state.cards : state.accounts.filter(a => a.assetType === scope));
  if (!rows.length) { notice("순서를 바꿀 항목이 없습니다."); return; }
  modal("순서 편집", `<p class="muted">손잡이를 끌어서 순서를 바꾼 뒤 저장하세요. 키보드에서는 손잡이에 포커스를 두고 ↑ ↓ 키로 이동합니다. 윱니·동구의 전체 목록을 함께 정렬합니다.</p><ol id="order-list">${rows.map(a => `<li data-order-id="${a.id}"><button type="button" class="drag-handle" aria-label="${esc(a.accountName || a.cardName)} 순서 이동">⠿</button><span><b>${esc(a.accountName || a.cardName)}</b><small>${esc(label("OwnerCode", a.ownerCode))} · ${esc(label("AssetStatus", a.status))}</small></span><span class="order-number"></span></li>`).join("")}</ol><p id="order-status" class="muted" aria-live="polite"></p>`, async () => {
    const ids = $$("#order-list li").map(li => Number(li.dataset.orderId));
    await api("/display-order/" + scope, "PUT", {ids});
  });
  const list = $("#order-list");
  const announce = () => {
    [...list.children].forEach((li,i) => $(".order-number",li).textContent = String(i+1));
    $("#order-status").textContent = "정렬 변경은 저장 버튼을 누르면 적용됩니다.";
  };
  // Pointer Events로 마우스와 터치를 함께 처리한다. 금융 데이터 요청은 최종 저장 시 한 번만 보낸다.
  $$(".drag-handle",list).forEach(handle => {
    const row = handle.closest("li");
    handle.onpointerdown = e => {
      if (e.button !== 0) return;
      handle.setPointerCapture(e.pointerId); row.classList.add("dragging");
    };
    handle.onpointermove = e => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const target = document.elementFromPoint(e.clientX,e.clientY)?.closest("#order-list li");
      if (target && target !== row) {
        const bounds=target.getBoundingClientRect();
        list.insertBefore(row, e.clientY < bounds.top+bounds.height/2 ? target : target.nextSibling);
        handle.setPointerCapture(e.pointerId);
        announce();
      }
      const body=$("#modal-body"), bounds=body.getBoundingClientRect();
      if(e.clientY>bounds.bottom-50) body.scrollTop+=12;
      if(e.clientY<bounds.top+50) body.scrollTop-=12;
    };
    const stop = () => row.classList.remove("dragging");
    handle.onpointerup = e => { if(handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId); stop(); };
    handle.onpointercancel=stop;handle.onlostpointercapture=stop;
    handle.onkeydown = e => {
      if(e.key === "ArrowUp" && row.previousElementSibling) {e.preventDefault(); list.insertBefore(row,row.previousElementSibling);}
      else if(e.key === "ArrowDown" && row.nextElementSibling) {e.preventDefault(); list.insertBefore(row.nextElementSibling,row);}
      else return;
      handle.focus(); announce();
    };
  });
  announce();
}
