async function renderPage(){
 pageTemplate();
 const month=$('#allowance-month');month.value=preference('allowance-month',monthNow());if(!/^\d{4}-\d{2}$/.test(month.value))month.value=monthNow();
 let items=[],index=0,ticket=0;
 const people=selected=>['HUSBAND','WIFE'].map(o=>'<option value="'+o+'" '+(o===selected?'selected':'')+'>'+label('OwnerCode',o)+'</option>').join('');
 function edit(row,sign){
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');const token=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  modal(row?'용돈 내역 수정':sign==='+'?'금액 추가':'사용액 추가',
   '<p class="muted">용돈 기록에만 반영합니다. 계좌 잔액은 변경하지 않습니다.</p><div class="fields">'+select('ownerCode','누구의 용돈인가요?',people(row?.ownerCode||(state.owner==='WIFE'?'WIFE':'HUSBAND')))+field('recordDate','날짜',row?.date||today(),'date','required')+select('direction','금액 구분','<option value="+" '+(sign==='+'?'selected':'')+'>+ 금액 추가</option><option value="-" '+(sign==='-'?'selected':'')+'>− 사용액</option>')+moneyField('amount','금액',row?fmt(row.amount).replaceAll(',','').replace('-',''):sign==='+'?'800000':'')+field('memo','메모',row?.memo||'','text','maxlength="300"')+'</div>',
   ()=>{const data=formData($('#modal-body'));if(decimal(data.amount)<=0n)throw new Error('금액을 0보다 크게 입력해주세요.');return api('/allowance'+(row?'/'+row.id:''),row?'PUT':'POST',{ownerCode:data.ownerCode,recordDate:data.recordDate,amount:(data.direction==='-'?'-':'')+data.amount,memo:data.memo||'',requestId:token});});
 }
 $('#allowance-plus').onclick=()=>edit(null,'+');$('#allowance-minus').onclick=()=>edit(null,'-');
 function draw(){
  const query=$('#allowance-search').value.trim().toLocaleLowerCase(),rows=items.filter(r=>(r.memo||'').toLocaleLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(rows.length/15));index=Math.min(index,pages-1);
  $('#allowance-status').textContent=rows.length+'건 · '+month.value+' 이용일 기준';
  $('#allowance-list').innerHTML=rows.length?table(['날짜','사용자','내용','금액','관리'],rows.slice(index*15,index*15+15).map(r=>[
   esc(r.date),label('OwnerCode',r.ownerCode),esc(r.memo||'용돈 기록')+'<div class="muted">'+(r.sourceEntryId?'카드 전표 연결':'직접 입력')+(r.sourceCancelled?' · 원거래 취소 / 합산 제외':'')+'</div>',r.sourceCancelled?'—':(decimal(r.amount)>0n?'+':'')+krw(r.amount),
   (r.sourceEntryId?(!r.sourceCancelled?'<button type="button" data-allowance-person="'+r.id+'">사람 변경</button>':'')+(r.currentEntryId?action('entry-detail',r.currentEntryId,'원거래'):''):'<button type="button" data-allowance-edit="'+r.id+'">수정</button>')+'<button type="button" data-allowance-remove="'+r.id+'">'+(r.sourceEntryId?'연결 해제':'삭제')+'</button>'
  ]),[0,1,2,3,4]):emptyState('표시할 용돈 내역이 없습니다.','금액을 직접 추가하거나 카드 전표 저장 시 용돈에 연결하세요.');
  $('#allowance-page').textContent=(index+1)+' / '+pages+' 페이지';$('#allowance-prev').disabled=index===0;$('#allowance-next').disabled=index===pages-1;
  $$('[data-allowance-edit]').forEach(b=>b.onclick=()=>{const row=items.find(r=>r.id===Number(b.dataset.allowanceEdit));edit(row,decimal(row.amount)>0n?'+':'-');});
  $$('[data-allowance-person]').forEach(b=>b.onclick=()=>{const row=items.find(r=>r.id===Number(b.dataset.allowancePerson));modal('용돈 사용자 변경',select('ownerCode','용돈에 반영할 사람',people(row.ownerCode)),()=>api('/allowance/source/'+row.sourceEntryId,'PUT',{ownerCode:$('[name=ownerCode]').value}));});
  $$('[data-allowance-remove]').forEach(b=>b.onclick=run(async()=>{const row=items.find(r=>r.id===Number(b.dataset.allowanceRemove));if(!await uiConfirm(row.sourceEntryId?'용돈 연결을 해제할까요? 기존 카드 거래는 유지됩니다.':'이 용돈 기록을 삭제할까요?'))return;await api('/allowance/'+row.id,'DELETE');await load();}));
 }
 async function load(){
  if(!month.value||!month.checkValidity())return;
  const request=++ticket;$('#allowance-status').textContent='용돈 내역을 불러오고 있습니다…';
  const result=await api('/allowance?month='+month.value+'&owner='+state.owner);if(request!==ticket||month!==$('#allowance-month'))return;
  items=result.items;index=0;
  $('#allowance-summary').innerHTML=result.summaries.map(s=>'<article><h3>'+label('OwnerCode',s.ownerCode)+'</h3><p class="muted">월말 기록 기준 잔액</p><strong class="allowance-balance">'+krw(s.balance)+'</strong>'+detailGrid({'이전 기록 잔액':krw(s.opening),'이번 달 추가':krw(s.added),'이번 달 사용':krw(s.used)})+'</article>').join('');draw();
 }
 month.onchange=run(async()=>{if(month.value)localStorage.setItem('allowance-month',JSON.stringify(month.value));await load();});$('#allowance-search').oninput=()=>{index=0;draw();};
 $('#allowance-prev').onclick=()=>{index--;draw();};$('#allowance-next').onclick=()=>{index++;draw();};await load();
}
