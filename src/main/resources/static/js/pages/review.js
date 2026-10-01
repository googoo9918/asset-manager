async function renderPage() {
  pageTemplate();
  const labels={all:'전체',CARD_PERIOD:'카드 이용기간',INSTALLMENT:'할부 연결',CATEGORY:'미분류 거래',SYNC:'잔고 갱신'};
  let items=[],pageIndex=0,selected='all',request=0;
  let deferred=preference('review-deferred',{});
  if(!deferred||typeof deferred!=='object'||Array.isArray(deferred))deferred={};
  const status=$('#review-status'),reload=$('#review-reload');
  const deferredKey=item=>item.id+':'+item.version;
  const isDeferred=item=>Number(deferred[deferredKey(item)]||0)>Date.now();
  const draw=()=>{
    const showDeferred=$('#review-deferred').checked,query=$('#review-search').value.trim().toLocaleLowerCase();
    const available=items.filter(item=>showDeferred||!isDeferred(item));
    $('#review-types').innerHTML=Object.entries(labels).map(([type,label])=>`<button type="button" data-review-type="${type}" aria-pressed="${selected===type}">${label}<strong>${available.filter(i=>type==='all'||i.type===type).length}</strong></button>`).join('');
    $$('[data-review-type]').forEach(b=>b.onclick=()=>{selected=b.dataset.reviewType;pageIndex=0;draw();});
    const visible=available.filter(i=>(selected==='all'||i.type===selected)&&(!query||(i.title+' '+i.description).toLocaleLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(visible.length/15));pageIndex=Math.min(pageIndex,pages-1);
    const hidden=items.filter(isDeferred).length;
    status.textContent=`표시 ${visible.length}건 · 전체 ${items.length}건${hidden?' · 나중에 보기 '+hidden+'건':''}`;
    $('#review-list').innerHTML=visible.length?visible.slice(pageIndex*15,pageIndex*15+15).map(item=>{
      const label=item.action==='classify'?'분류 수정':item.action==='entry-detail'?'거래 상세':item.action==='card-edit'?'이용기간 설정':item.type==='SYNC'?'연결 상태 확인':'청구 명세 확인';
      const primary=item.action==='classify'?`<button type="button" data-review-classify="${item.targetId}">${label}</button>`:item.action==='link'?`<a href="${ctx}${esc(item.href)}">${label} →</a>`:action(item.action,item.targetId,label);
      return `<article class="review-item"><div>${statusBadge(labels[item.type]||'확인 필요',item.type==='CATEGORY'?'neutral':'warning')}<h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><div class="muted">${item.date?esc(item.date):''}${item.amount==null?'':' · '+(item.type==='INSTALLMENT'?'잔여 총액 ':'거래 금액 ')+krw(item.amount)}</div></div><div class="review-actions">${primary}<button type="button" data-review-defer="${esc(item.id)}">${isDeferred(item)?'다시 표시':'하루 뒤에 보기'}</button></div></article>`;
    }).join(''):emptyState(items.length?'표시할 항목이 없습니다.':'현재 확인할 항목이 없습니다.',items.length?'종류·검색어를 바꾸거나 나중에 보기 포함을 선택하세요.':'새로운 거래나 설정 변경이 있으면 다시 확인할 수 있습니다.');
    $$('[data-review-classify]').forEach(b=>b.onclick=run(async()=>{
      const entry=await api('/transactions/'+b.dataset.reviewClassify);
      const categories=state.categories.filter(c=>c.active&&c.transactionType===entry.transactionType&&c.name!=='미분류');
      modal('거래 분류 변경',`<p>${esc(entry.transactionDate)} · ${esc(entry.memo||'거래')} · ${krw(entry.amount)}</p><p class="muted">분류만 변경합니다. 금액·잔액·거래번호와 기존 할부 연결은 그대로 유지하며 변경 이력을 남깁니다.</p>`+select('categoryId','변경할 분류','<option value="">분류 선택</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.parentId?catName(c.parentId)+' > '+c.name:c.name)}</option>`).join('')),()=>api('/review/entries/'+entry.id+'/category','POST',{categoryId:$('[name=categoryId]').value,expectedCategoryId:entry.categoryId??null}));
      $('[name=categoryId]').required=true;
    }));
    $$('[data-review-defer]').forEach(b=>b.onclick=()=>{
      const item=items.find(i=>i.id===b.dataset.reviewDefer);const key=deferredKey(item),next={...deferred};
      Object.keys(next).forEach(k=>{if(Number(next[k])<=Date.now())delete next[k];});
      if(isDeferred(item))delete next[key];else next[key]=Date.now()+86400000;
      try{localStorage.setItem('review-deferred',JSON.stringify(next));deferred=next;draw();}catch(e){notice('나중에 보기 설정을 저장하지 못했습니다.',true);}
    });
    $('#review-page').textContent=`${pageIndex+1} / ${pages} 페이지`;
    $('#review-prev').disabled=pageIndex===0;$('#review-next').disabled=pageIndex===pages-1;
  };
  $('#review-prev').onclick=()=>{pageIndex--;draw();};$('#review-next').onclick=()=>{pageIndex++;draw();};
  $('#review-search').oninput=$('#review-deferred').onchange=()=>{pageIndex=0;draw();};
  const load=async()=>{
    const ticket=++request;reload.disabled=true;status.textContent='확인할 내역을 불러오고 있습니다…';
    try{const result=await api('/review?owner='+state.owner);if(ticket!==request||status!==$('#review-status'))return;items=result.items||[];draw();}
    catch(e){if(status===$('#review-status')){status.textContent='내역을 불러오지 못했습니다. '+e.message;$('#review-list').innerHTML=emptyState('다시 확인해주세요.','상단의 다시 확인 버튼으로 재시도할 수 있습니다.');$('#review-prev').disabled=true;$('#review-next').disabled=true;}}
    finally{reload.disabled=false;}
  };
  reload.onclick=load;await load();
}
