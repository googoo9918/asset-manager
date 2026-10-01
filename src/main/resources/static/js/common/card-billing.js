// Read-only estimates; actual account debits remain in the existing payment workflow.
function bindCardBilling() {
  const month=$('#billing-month'),status=$('#billing-status'),cards=$('#billing-cards'),accounts=$('#billing-accounts');
  if(!month)return;
  const requestedMonth=new URLSearchParams(location.search).get('billingMonth');
  month.value=requestedMonth&&/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)?requestedMonth:preference('card-billing-month',monthNow());
  let request=0;
  const load=async()=>{
    if(!month.value)return;
    const ticket=++request;status.textContent='예상 청구 명세를 계산하고 있습니다…';
    try {
      const result=await api('/card-billing?month='+month.value+'&owner='+state.owner);
      if(ticket!==request||status!==$('#billing-status'))return;
      const rows=result.cards||[],groups=result.accounts||[];
      status.textContent=`${month.value} 결제 기준 · ${rows.length}개 신용카드 · 현재 이용기간 설정으로 계산`;
      accounts.innerHTML=groups.length?'<h3>결제계좌별 비교</h3>'+table(['결제계좌 / 예정일','계산된 예상액','실제 출금액','차이 (실제 − 예상)'],groups.map(g=>[
        esc(accName(g.accountId))+'<div class="muted">'+esc(g.dueDate)+'</div>',krw(g.expected)+(g.completeEstimate?'':'<div class="muted">미설정·중복 또는 합산 범위 확인</div>'),
        g.actualAmount==null?'미입력':krw(g.actualAmount),g.difference==null?'비교 대기':krw(g.difference)
      ]),[0,1,2,3]):'';
      cards.innerHTML=rows.length?rows.map((c,i)=>`<details class="billing-card" ${i===0?'open':''}><summary>${esc(c.cardName)} · ${esc(c.dueDate)} · ${c.configured?krw(c.expected):'이용기간 미설정'}</summary><div class="toolbar">${action('card-edit',c.cardId,'이용기간 설정')}<span>${c.period?esc(c.period.from)+' ~ '+esc(c.period.to)+' 이용분 · 이전 구매 할부 회차 포함':'카드 수정에서 이용기간을 설정하면 일시불·할부 예상액을 계산합니다.'}</span></div><div data-billing-lines="${c.cardId}"></div></details>`).join(''):emptyState('표시할 신용카드가 없습니다.','신용카드를 등록하고 이용기간을 설정해주세요.');
      for(const statement of rows) {
        const target=$(`[data-billing-lines="${statement.cardId}"]`);let page=0;
        const draw=()=>{
          const lines=statement.lines||[],pages=Math.max(1,Math.ceil(lines.length/15));
          target.innerHTML=(lines.some(l=>l.installmentId&&!l.linked)?'<p class="muted">별도 등록한 기존 할부가 포함되어 있습니다. 같은 구매가 이용내역에도 있다면 원거래를 연결해 이중 합산을 막아주세요.</p>':'')+
            table(['이용일 / 내역','구매액','이번 예상 청구액','회차','상태 / 관리'],lines.slice(page*15,page*15+15).map(l=>[
              esc(l.transactionDate||'기존 할부')+'<div>'+esc(l.description||'카드 사용')+'</div>',l.purchaseAmount==null?'—':krw(l.purchaseAmount),krw(l.amount),
              (l.installmentId?'등록 회차 ':'')+l.installment+' / '+l.months,
              statusBadge(l.status==='PENDING'&&statement.dueDate<today()?'출금 확인 필요':({PENDING:'청구 예정',COMPLETED:'결제월 완료',CANCELLED:'결제 일정 취소',REVIEW:'원거래 확인 필요'})[l.status]||'확인 필요',l.status==='COMPLETED'?'success':'neutral')+
                (l.installmentId?`<button type="button" data-billing-link="${l.installmentId}" data-card="${statement.cardId}" data-entry="${l.entryId||''}">${l.linked?'원거래 연결 변경':'원거래 연결'}</button>`:'')
            ]),[0,2,3,4])+`<div class="toolbar pagination"><button type="button" data-billing-prev ${page===0?'disabled':''}>이전</button><span>${page+1} / ${pages} 페이지 · ${lines.length}건</span><button type="button" data-billing-next ${page===pages-1?'disabled':''}>다음</button></div>`;
          $('[data-billing-prev]',target).onclick=()=>{page--;draw();};$('[data-billing-next]',target).onclick=()=>{page++;draw();};
          $$('[data-billing-link]',target).forEach(b=>b.onclick=run(async()=>{
            const entries=await api('/transactions');
            const candidates=entries.filter(e=>!e.voided&&eq(e.cardId,b.dataset.card)&&e.paymentMethod==='CREDIT'&&e.transactionType==='EXPENSE'&&e.installmentMonths>1);
            modal('기존 할부의 원거래 연결','<p>같은 구매를 선택하면 예상액은 기존 할부 일정만 반영합니다. 원거래의 자동 계산 회차는 제외하며 실제 거래·잔액·납부 이력은 변경하지 않습니다.</p>'+select('entryId','같은 할부 구매','<option value="">연결 안 함 (별도 합산)</option>'+candidates.map(e=>`<option value="${e.id}" ${eq(e.id,b.dataset.entry)?'selected':''}>${esc(e.transactionDate)} · ${esc(e.memo||'카드 구매')} · ${krw(e.amount)} · ${e.installmentMonths}개월</option>`).join('')),()=>api('/card-billing/installments/'+b.dataset.billingLink+'/source','POST',formData($('#modal-body'))));
          }));
          if(typeof enhanceTables==='function')enhanceTables();
        };
        draw();
      }
    }catch(e){if(ticket===request&&status===$('#billing-status')){status.textContent='예상 명세를 불러오지 못했습니다. '+e.message;accounts.innerHTML='';cards.innerHTML='';}}
  };
  month.onchange=()=>{localStorage.setItem('card-billing-month',JSON.stringify(month.value));load();};
  $('#billing-reload').onclick=load;load();
}
