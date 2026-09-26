// Reuse the user's normal Chrome profile. Pair once; subsequent collections reconnect automatically.
const kbFields = [
  ['date','이용일',['이용일','이용일자','승인일','승인일자','거래일자','이용일시']],
  ['merchant','가맹점',['가맹점명','이용가맹점','이용가맹점명','가맹점','이용하신곳']],
  ['amount','원화 이용금액 (할부는 전체 구매액)',['이용금액','승인금액','원화금액','이용금액(원)']],
  ['status','승인·취소 상태',['이용상태','승인상태','상태','취소여부']],
  ['installmentMonths','할부개월',['할부개월','할부기간','할부','결제방법']],
  ['approvalNumber','승인번호',['승인번호']]
];
function kbNormalizeRow(cells, columns, industry='') {
  const value = field => columns[field] < 0 ? '' : String(cells[columns[field]] ?? '').trim();
  const rawDate = value('date').replace(/[./]/g,'-');
  const match = rawDate.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:\s|$)/);
  if (!match) throw new Error('이용일은 연도를 포함한 날짜여야 합니다.');
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw new Error('이용일을 확인해주세요.');
  const merchant = value('merchant');
  if (!merchant) throw new Error('가맹점이 비어 있습니다.');
  const amount = value('amount').replace(/[,\s₩원]/g,'');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(amount)) throw new Error('원화 이용금액 열을 선택해주세요. 해외 통화 금액은 바로 가져올 수 없습니다.');
  const installment = value('installmentMonths');
  const pointPayment=installment==='포인트리';
  let months = 1;
  if (installment && !pointPayment && !['일시불','0','00','1','01','일시불(0)'].includes(installment)) {
    if (!/^\d{1,3}\s*(개월)?$/.test(installment)) throw new Error('할부개월을 해석하지 못했습니다. 총 할부개월 열을 확인해주세요.');
    months = parseInt(installment,10);
  }
  if(months<1||months>120) throw new Error('할부개월은 1~120개월이어야 합니다.');
  const stateText = value('status').replace(/\s/g,'');
  const status = ['승인','정상','정상승인','승인완료','매입','매입완료','전표매입','전표미매입','N'].includes(stateText) ? 'APPROVED'
    : /취소|환불/.test(stateText)||stateText==='Y' ? 'CANCELLED' : 'UNKNOWN';
  return { date, merchant, amount, status, installmentMonths: months, approvalNumber: value('approvalNumber') || null, pointPayment, industry };
}
function kbReceiptIndustry(cells,headers,receipts){
  const names=headers.map(h=>String(h).replace(/\s/g,''));
  const keys=['이용일시','이용카드명','승인번호','상태'];
  if(keys.some(k=>!names.includes(k)))return '';
  const sourceKey=keys.map(k=>cells[names.indexOf(k)]).join('|');
  const matches=receipts.filter(r=>r.sourceKey===sourceKey);
  return matches.length===1?String(matches[0].fields?.industry||''):'';
}
function kbCollectionSummary(result){
  const sheet=result.tables[0],headers=sheet.rows[0].map(h=>String(h).replace(/\s/g,'')),groups=new Map();
  const index=name=>headers.indexOf(name);
  const number=value=>{
    const text=String(value??'').replace(/[,\s]/g,'');
    if(!text||text==='-'||text==='—')return 0n;
    const match=text.match(/^(-?\d+(?:\.\d+)?)(?:원|점|P)?$/);
    return match?decimal(match[1]):null;
  };
  for(const row of sheet.rows.slice(1)){
    const name=row[index('이용카드명')]||'카드 확인 필요';
    if(!groups.has(name))groups.set(name,{count:0,cancelled:0,amount:0n,pointPayment:0n,discount:0n,points:0n});
    const group=groups.get(name);group.count++;
    if(/취소|환불/.test(row[index('상태')]||'')){group.cancelled++;continue;}
    for(const [field,column] of [[row[index('결제방법')]==='포인트리'?'pointPayment':'amount','이용금액'],['discount','할인금액'],['points','적립예상포인트리']]){
      const value=number(row[index(column)]);group[field]=group[field]===null||value===null?null:group[field]+value;
    }
  }
  const amount=value=>value===null?'확인 필요':krw(decimalString(value));
  return '<h3>카드별 수집 요약</h3>'+table(['카드','내역 / 취소','카드 결제액','포인트리 결제액','할인금액','적립예상 포인트리'],[...groups].map(([name,g])=>[esc(name),`${g.count}건 / ${g.cancelled}건`,amount(g.amount),amount(g.pointPayment),amount(g.discount),g.points===null?'확인 필요':fmt(decimalString(g.points))+'P']));
}
function openKbImport() {
  modal('KB국민카드 가져오기', `
    <p>평소 사용하는 Chrome에서 KB에 로그인해주세요. 선택한 조회 기간의 전체 페이지와 매출전표를 자동으로 수집합니다.</p>
    <p>① 이용내역 수집 → ② 앱 카드 연결·중복 확인 → ③ 거래내역 등록. 등록한 거래는 연결된 카드의 사용내역과 사용액에도 반영됩니다.</p>
    <div class="toolbar"><button type="button" id="kb-collect" class="primary">이용내역·매출전표 가져오기</button><button type="button" id="kb-existing">KB 로그인 화면 열기</button><button type="button" id="kb-latest">최근 수집 결과</button></div>
    <p id="kb-connection" role="status">Chrome 연결 확인 중…</p>
    <details id="kb-setup"><summary>최초 연결 설정</summary>
      <p>확장 프로그램에 아래 연결코드를 한 번만 등록해주세요. 이후 앱을 다시 실행해도 자동으로 연결합니다.</p>
      <button type="button" id="kb-connect">연결 상태 확인</button><p id="kb-code"></p>
    </details>
    <p class="muted">수집 후 카드별 내역과 전표를 확인할 수 있습니다. 가계부 거래 저장은 별도로 선택한 내역만 반영합니다.</p>
    <details><summary>파일 또는 현재 화면에서 가져오기</summary>
    <label>파일 선택 (CSV·TSV·XLSX·확장 프로그램 파일, 5MB 이하)<input id="kb-file" type="file" accept=".csv,.tsv,.xlsx,.kbcard.json"></label>
    <button type="button" id="kb-connected-read">현재 화면만 읽기</button></details>
    <details><summary>별도 로그인 창 사용 (기존 Chrome의 인증은 공유되지 않음)</summary>
      <div class="toolbar"><button type="button" id="kb-open">별도 로그인 창 열기</button><button type="button" id="kb-capture">조회 결과 읽기</button><button type="button" id="kb-close">별도 로그인 창 종료</button></div>
    </details>
    <p id="kb-message" role="status"></p><div id="kb-evidence"></div><div id="kb-mapping"></div><div id="kb-preview"></div>`, null);
  let tables=[], preview=null, busy=false, savedMappings=[], receiptRows=[];
  const act = fn => async () => {
    if(busy) return;
    busy=true; $('#kb-message').textContent='처리 중입니다…';
    if($('#kb-save-message'))$('#kb-save-message').textContent='';
    const buttons=$$('#modal-body button'); buttons.forEach(b=>b.disabled=true);
    try { await fn(); } catch(e) {
      if($('#kb-connection')===connectionNode){
        $('#kb-message').textContent=e.message;
        const target=$('#kb-save-message')||$('#kb-message');
        target.textContent=e.message;
        target.scrollIntoView({block:'nearest'});
        target.focus({preventScroll:true});
      }
    }
    finally {
      busy=false; buttons.forEach(b=>b.disabled=false);
      if($('#kb-connection')===connectionNode && $('#kb-message').textContent==='처리 중입니다…')
        $('#kb-message').textContent='처리가 완료되었습니다.';
    }
  };
  $('#kb-existing').onclick=act(async()=>{ await api('/kb-card/browser','POST',{}); $('#kb-message').textContent='기존 Chrome에서 PIN 로그인 후 확장 프로그램을 연결해주세요. 프로필이 여러 개면 평소 KB를 이용하는 프로필을 선택해주세요.'; });
  const connectionNode=$('#kb-connection');
  async function checkConnection(){
    const result=await api('/kb-card/connect','POST',{});
    if($('#kb-connection')!==connectionNode)return;
    $('#kb-code').textContent='연결코드: '+result.code;
    connectionNode.textContent=result.connected?'Chrome 연결됨':'자동 연결 대기 중 · 처음 사용한다면 연결 설정을 펼쳐주세요.';
  }
  $('#kb-connect').onclick=act(async()=>{
    await checkConnection();
    if($('#kb-connection')===connectionNode)$('#kb-message').textContent=connectionNode.textContent;
  });
  checkConnection().catch(e=>{if($('#kb-connection')===connectionNode)connectionNode.textContent=e.message;});
  $('#kb-connected-read').onclick=act(async()=>loaded(await api('/kb-card/capture','POST',{})));
  $('#kb-latest').onclick=act(async()=>showCollection(await api('/kb-card/latest')));
  // The saved collection survives closing this dialog and restarting the app.
  act(async()=>{
    try{
      const result=await api('/kb-card/latest');
      if($('#kb-connection')===connectionNode)await showCollection(result);
    }catch(e){
      if($('#kb-connection')===connectionNode)$('#kb-message').textContent='최근 수집 결과를 불러오지 못했습니다. 저장된 결과가 있다면 ‘최근 수집 결과’를 눌러 다시 시도해주세요.';
    }
  })();
  $('#kb-collect').onclick=act(async()=>{
    await api('/kb-card/collect','POST',{});
    for(;;){
      await new Promise(resolve=>setTimeout(resolve,1000));
      if($('#kb-connection')!==connectionNode)return;
      const job=await api('/kb-card/collection');
      if(job.state==='failed')throw new Error(job.message);
      if(job.state==='done'){
        await showCollection(job.result);
        break;
      }
      if(job.state==='idle')throw new Error('수집 도구가 다시 시작되었습니다. 최근 수집 결과를 확인하거나 다시 가져와주세요.');
      $('#kb-message').textContent=job.progress?.phase==='connecting'?'등록된 Chrome에 자동 연결 중입니다…':`수집 중 · ${job.progress?.page||1}페이지, 이용내역 ${job.progress?.collected||0}/${job.progress?.expected||'?'}건, 전표 ${job.progress?.receipts||0}건`;
    }
  });
  async function showCollection(result){
    await loaded({source:'collection',tables:result.tables,receipts:result.receipts});
    $('#kb-message').textContent=`${result.range} · 이용내역 ${result.expected}건, 전표 ${result.receipts.length}건을 수집했습니다. 아직 거래내역에는 등록되지 않았습니다. 아래에서 앱에 연결할 카드를 선택하고 중복 확인 후 등록해주세요.`;
    $('#kb-evidence').innerHTML=kbCollectionSummary(result)+`${result.warnings.length?'<p>일부 전표를 확인하지 못했습니다. 아래 원본에서 확인해주세요.</p>':''}
      <details><summary>수집된 매출전표 ${result.receipts.length}건 보기</summary>${result.receipts.map(r=>`<details><summary>${esc(r.fields.date)} · ${esc(r.fields.merchant)} · ${esc(r.fields.total)}</summary>${table(['항목','내용'],Object.entries(r.fields).map(([k,v])=>[esc(({cardName:'카드명',cardNumber:'카드번호',date:'거래일자',approvalNumber:'승인번호',transactionType:'거래유형',approvalStatus:'승인상태',paymentMethod:'결제방법',installments:'할부',merchant:'가맹점명',industry:'업종',businessNumber:'사업자번호',amount:'금액',tax:'부가세',serviceCharge:'봉사료',total:'합계',pointsUsed:'포인트리 사용금액'})[k]||k),esc(v)]))}</details>`).join('')}</details>`;
  }
  $('#kb-open').onclick=act(async()=>{ await api('/kb-card/automation-browser','POST',{}); $('#kb-message').textContent='별도 브라우저에서 직접 로그인하고 이용내역을 조회해주세요. PIN은 앱에 저장하지 않습니다.'; });
  $('#kb-close').onclick=act(async()=>{ await api('/kb-card/browser','DELETE'); $('#kb-message').textContent='로그인 브라우저를 종료했습니다.'; });
  async function loaded(result) {
    $('#kb-mapping').innerHTML='';$('#kb-preview').innerHTML='';preview=null;
    savedMappings=await api('/kb-card/mappings');
    if($('#kb-connection')!==connectionNode)return;
    receiptRows=result.receipts||[];
    tables=result.tables.filter(t=>t.rows.length>1);
    if(!tables.length) throw new Error('읽을 데이터가 없습니다.');
    preview=null; $('#kb-preview').innerHTML=''; $('#kb-evidence').innerHTML='';
    $('#kb-message').textContent=result.source==='download'?'브라우저에서 내려받은 최신 파일을 읽었습니다.':'표를 읽었습니다. 카드와 각 열의 의미를 확인해주세요.';
    $('#kb-mapping').innerHTML=`<h3>거래내역에 등록할 카드 연결</h3><details><summary>표 읽기 설정</summary><label>가져올 표 <select id="kb-table">${tables.map((t,i)=>`<option value="${i}">${esc(t.name)} (${t.rows.length}행)</option>`).join('')}</select></label>
      <label>열 제목이 있는 행 <input id="kb-header" type="number" min="1" value="1"></label></details>
      <div id="kb-columns"></div>`;
    $('#kb-table').onchange=()=>{ $('#kb-header').value=1; mapping(); };
    $('#kb-header').onchange=mapping; mapping();
  }
  $('#kb-capture').onclick=act(async()=>{
    invalidate();$('#kb-mapping').innerHTML='';
    await loaded(await api('/kb-card/capture','POST',{}));
  });
  $('#kb-file').onchange=act(async()=>{
    const file=$('#kb-file').files[0]; if(!file) { $('#kb-message').textContent='파일을 선택해주세요.'; return; }
    if(file.size>5*1024*1024) throw new Error('파일은 5MB 이하여야 합니다.');
    const base64=await new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result.split(',')[1]); reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.')); reader.readAsDataURL(file); });
    await loaded(await api('/kb-card/file','POST',{name:file.name,base64}));
  });
  function invalidate() { preview=null; $('#kb-preview').innerHTML=''; }
  function mapping() {
    invalidate();
    const sheet=tables[Number($('#kb-table').value)], header=Number($('#kb-header').value)-1;
    if(!Number.isInteger(header)||header<0||header>=sheet.rows.length) { $('#kb-columns').textContent='열 제목 행을 확인해주세요.'; return; }
    const names=sheet.rows[header];
    const sourceCardIndex=names.findIndex(n=>['이용카드명','카드명'].includes(String(n).replace(/\s/g,'')));
    const sourceCards=sourceCardIndex<0?[]:[...new Set(sheet.rows.slice(header+1).map(r=>r[sourceCardIndex]).filter(Boolean))];
    $('#kb-columns').innerHTML=`<p>처음 한 번만 앱 카드를 선택해주세요. 미리보기 시 연결을 저장하고, 다음 수집·등록부터 자동 적용합니다. 거래는 최종 확인 후에만 등록됩니다.</p>
      ${sourceCards.length?`<label>수집된 카드 <select id="kb-source-card">${sourceCards.map((c,i)=>`<option value="${i}">${esc(c)}</option>`).join('')}</select></label>`:''}
      <label>앱에 연결할 카드 <select id="kb-card"><option value="">카드 선택</option>${own(state.cards).filter(c=>c.status==='ACTIVE').map(c=>`<option value="${c.id}">${esc(c.cardName)} · ${esc(label('OwnerCode',c.ownerCode))}</option>`).join('')}</select></label>
      <details><summary>자동 인식된 열 확인·수정</summary><div class="form-grid">${kbFields.map(([field,label,aliases])=>{
        const index=names.findIndex(n=>aliases.includes(String(n).replace(/\s/g,'')));
        return `<label>${label}<select id="kb-col-${field}"><option value="-1">${field==='approvalNumber'?'없음':'열 선택'}</option>${names.map((n,i)=>`<option value="${i}" ${i===index?'selected':''}>${i+1}. ${esc(n||'(빈 제목)')}</option>`).join('')}</select></label>`;
      }).join('')}</div>
      <p class="muted">승인 상태·할부개월 열이 없는 경우 자동으로 정상/일시불로 추정하지 않습니다. 화면에 해당 항목이 있는 표를 선택해주세요.</p>
      ${table(names,sheet.rows.slice(header+1,header+6).map(r=>r.map(esc)))}</details>
      <p id="kb-saved-mapping"></p><button type="button" id="kb-check">미리보기 · 중복 확인</button>`;
    $$('#kb-columns select').forEach(el=>el.onchange=invalidate);
    const applyMapping=()=>{
      invalidate();
      const saved=savedMappings.find(m=>m.sourceCard===sourceCards[Number($('#kb-source-card')?.value)]);
      $('#kb-card').value=saved?String(saved.cardId):'';
      $('#kb-card').disabled=!!saved;
      $('#kb-saved-mapping').textContent=saved
        ? `연결 저장됨 · ${saved.sourceCard} → ${state.cards.find(c=>eq(c.id,saved.cardId))?.cardName||'카드 확인 필요'} → ${accName(saved.accountId)}${saved.pointPayment?' · 포인트리 거래 등록 시 사용액 차감':''}`
        : sourceCards.length?'아직 연결되지 않은 카드입니다. 카드 선택 후 미리보기를 누르면 연결을 저장합니다.':'원본에 이용 카드명이 없어 연결을 저장할 수 없습니다. 이번 내역의 카드를 선택해주세요.';
    };
    if($('#kb-source-card'))$('#kb-source-card').onchange=applyMapping;
    applyMapping();
    $('#kb-check').onclick=act(async()=>{
      invalidate();
      const cardId=$('#kb-card').value; if(!cardId) throw new Error('앱에 연결할 카드를 선택해주세요.');
      const columns=Object.fromEntries(kbFields.map(([f])=>[f,Number($('#kb-col-'+f).value)]));
      if(kbFields.some(([f])=>f!=='approvalNumber'&&columns[f]<0)) throw new Error('이용일·가맹점·원화 금액·상태·할부개월 열을 모두 선택해주세요.');
      const selected=Object.values(columns).filter(v=>v>=0);
      if(new Set(selected).size!==selected.length) throw new Error('같은 열을 여러 항목에 연결할 수 없습니다.');
      const rows=[], errors=[];
      sheet.rows.slice(header+1).forEach((cells,i)=>{
        if(cells.every(c=>!String(c).trim())) return;
        if(sourceCards.length&&cells[sourceCardIndex]!==sourceCards[Number($('#kb-source-card').value)])return;
        try { rows.push(kbNormalizeRow(cells,columns,kbReceiptIndustry(cells,names,receiptRows))); } catch(e) { errors.push(`${header+i+2}행: ${e.message}`); }
      });
      if(!rows.length) throw new Error('가져올 거래가 없습니다. '+errors.slice(0,3).join(' / '));
      if(rows.length>500) throw new Error('한 번에 500건까지 저장할 수 있습니다. 조회 기간을 줄여주세요.');
      const sourceCard=sourceCards[Number($('#kb-source-card')?.value)]||null;
      if(sourceCard&&!savedMappings.some(m=>m.sourceCard===sourceCard)){
        const card=state.cards.find(c=>eq(c.id,cardId));
        const saved=await api('/kb-card/mappings','PUT',{sourceCard,cardId:card.id,accountId:card.accountId,pointPayment:rows.every(row=>row.pointPayment)});
        savedMappings.push(saved);applyMapping();
      }
      preview=await api('/kb-card/preview','POST',{cardId,rows,sourceCard});
      drawPreview(cardId,errors);
    });
  }
  function drawPreview(cardId,errors) {
    const card=state.cards.find(c=>eq(c.id,cardId));
    const pointDebit=preview.rows.some(x=>x.status==='READY'&&x.row.pointPayment);
    const categoryOptions=id=>{
      const active=state.categories.filter(c=>c.active&&c.transactionType==='EXPENSE');
      return '<option value="">분류 선택</option>'+active.filter(c=>!c.parentId).map(parent=>
        `<optgroup label="${esc(parent.name)}"><option value="${parent.id}" ${eq(id,parent.id)?'selected':''}>${esc(parent.name)} (대분류)</option>`+
        active.filter(c=>eq(c.parentId,parent.id)).map(c=>`<option value="${c.id}" ${eq(id,c.id)?'selected':''}>${esc(parent.name)} > ${esc(c.name)}</option>`).join('')+'</optgroup>').join('');
    };
    $('#kb-message').textContent=`${preview.rows.length}건을 확인했습니다. 읽지 못한 행 ${errors.length}건.`;
    $('#kb-preview').innerHTML=`<h3>거래내역 등록 · ${esc(card.cardName)}</h3>
      <p>등록 가능한 내역 ${preview.rows.filter(x=>x.status==='READY').length}건. 중복·취소·확인이 필요한 내역은 등록에서 제외됩니다.</p>
      ${errors.length?`<details><summary>읽지 못한 행 ${errors.length}건 (저장 제외)</summary><p>${errors.map(esc).join('<br>')}</p></details>`:''}
      <label><input type="checkbox" id="kb-select-all">등록 가능한 내역 전체 선택</label>
      ${table(['선택','이용일','가맹점 / 업종','원화 금액','결제','분류 / 근거','확인 결과'],preview.rows.map(x=>[
        x.status==='READY'?`<input type="checkbox" data-kb-row="${x.index}" aria-label="${esc(x.row.merchant)} 저장">`:'—',
        esc(x.row.date),esc(x.row.merchant)+`<div class="muted">${esc(x.row.industry||'전표 업종 없음')}</div>`,krw(x.row.amount),x.row.pointPayment?'포인트리':x.row.installmentMonths===1?'일시불':x.row.installmentMonths+'개월',
        x.status==='READY'?`<select data-kb-category="${x.index}" aria-label="${esc(x.row.merchant)} 분류">${categoryOptions(x.categoryId)}</select><div class="muted">${esc(x.categoryReason||'분류를 선택해주세요.')}</div><label><input type="checkbox" data-kb-remember="${x.index}">다음부터 동일 가맹점·업종에 적용</label>`:'—',esc(x.reason)]))}
      <label>등록 가능한 내역의 분류 일괄 변경 <select id="kb-category">${categoryOptions(null)}</select></label>
      <details><summary>카테고리 추가</summary><label>추가할 위치 <select id="kb-new-parent"><option value="">새 대분류</option>${state.categories.filter(c=>c.active&&c.transactionType==='EXPENSE'&&!c.parentId).map(c=>`<option value="${c.id}">${esc(c.name)} 아래 중분류</option>`).join('')}</select></label><label>이름 <input id="kb-new-name" maxlength="80"></label><button type="button" id="kb-add-category">카테고리 추가</button></details>
      ${card.cardType==='DEBIT'?'<label>체크카드 연결계좌 잔액 <select id="kb-balance"><option value="">반영 방법 선택</option><option value="false">현재 잔액에 이미 반영됨 — 사용내역만 저장</option><option value="true">아직 반영되지 않음 — 사용액만큼 차감</option></select></label>':'<p class="muted">신용카드는 전체 구매액을 지출로 기록하며, 카드대금 출금은 기존 결제 처리에서 관리합니다.</p>'}
      <p id="kb-selection-summary" role="status"></p>
      <label><input type="checkbox" id="kb-confirm-card">카드·금액·분류와 잔액 반영 방법을 확인했습니다. (필수)</label>
      <p id="kb-save-message" class="error" role="alert" tabindex="-1"></p>
      <button type="button" id="kb-save" class="primary">분류 확인 후 최종 등록</button>`;
    $('#kb-category').onchange=()=>{
      if($('#kb-category').value)$$('[data-kb-category]').forEach(el=>el.value=$('#kb-category').value);
    };
    $('#kb-add-category').onclick=act(async()=>{
      const name=$('#kb-new-name').value.trim(),parentId=$('#kb-new-parent').value||null;
      if(!name)throw new Error('추가할 카테고리 이름을 입력해주세요.');
      const c=await api('/categories','POST',{name,parentId,transactionType:'EXPENSE',active:true});
      state.categories.push(c);
      $$('[data-kb-category],#kb-category').forEach(el=>{const value=el.value;el.innerHTML=categoryOptions(value);});
      if(!c.parentId)$('#kb-new-parent').add(new Option(c.name+' 아래 중분류',c.id));
      $('#kb-new-name').value='';$('#kb-message').textContent='카테고리를 추가했습니다. 거래별 분류에서 선택해주세요.';
    });
    if(pointDebit&&$('#kb-balance')){
      $('#kb-balance').value='true';$('#kb-balance').disabled=true;
      $('#kb-balance').insertAdjacentHTML('afterend',`<p>포인트리 사용액은 ${esc(accName(card.accountId))}에서 차감됩니다. 중복 거래는 다시 차감하지 않습니다.</p>`);
    }
    const updateSelection=()=>{
      const rows=$$('[data-kb-row]'),selected=rows.filter(row=>row.checked).length;
      $('#kb-select-all').checked=rows.length>0&&selected===rows.length;
      $('#kb-select-all').indeterminate=selected>0&&selected<rows.length;
      $('#kb-selection-summary').textContent=rows.length
        ? `등록 가능한 ${rows.length}건 중 ${selected}건 선택 · 등록할 내역을 선택하고 아래 필수 확인란에 체크해주세요.`
        : '등록 가능한 내역이 없습니다. 중복 또는 확인이 필요한 내역을 확인해주세요.';
    };
    $('#kb-select-all').onchange=()=>{const checked=$('#kb-select-all').checked;$$('[data-kb-row]').forEach(el=>el.checked=checked);updateSelection();};
    $$('[data-kb-row]').forEach(el=>el.onchange=updateSelection);
    updateSelection();
    $('#kb-save').onclick=act(async()=>{
      if(!$('#kb-confirm-card').checked) throw new Error('등록 버튼 위의 “카드·금액·분류와 잔액 반영 방법을 확인했습니다” 필수 확인란에 체크해주세요.');
      const indices=$$('[data-kb-row]:checked').map(el=>Number(el.dataset.kbRow));
      if(!indices.length) throw new Error('저장할 내역을 선택해주세요.');
      const balance=card.cardType==='DEBIT'?$('#kb-balance').value:'false';
      if(balance==='') throw new Error('체크카드 잔액 반영 방법을 선택해주세요.');
      const selections=indices.map(index=>({index,categoryId:$(`[data-kb-category="${index}"]`).value,remember:$(`[data-kb-remember="${index}"]`).checked}));
      if(selections.some(x=>!x.categoryId))throw new Error('선택한 거래마다 지출 분류를 선택해주세요.');
      const selectedRows=indices.map(index=>preview.rows.find(x=>x.index===index).row);
      const amount=sum(selectedRows.map(row=>row.amount));
      const unclassified=selections.filter(x=>state.categories.find(c=>eq(c.id,x.categoryId))?.name==='미분류').length;
      const deduction=card.cardType==='DEBIT'&&balance==='true'?`${accName(card.accountId)}에서 ${krw(amount)} 차감`:'연결 자산 잔액 차감 없음';
      if(!await uiConfirm(`${card.cardName}\n${indices.length}건 · ${krw(amount)} 등록 (미분류 ${unclassified}건)\n${deduction}\n가맹점·업종 규칙 ${selections.filter(x=>x.remember).length}건 저장\n확인하면 거래내역과 카드 사용내역에 등록합니다.`)){
        $('#kb-message').textContent='등록을 취소했습니다. 거래와 분류 규칙은 저장하지 않았습니다.';return;
      }
      const result=await api('/kb-card/commit','POST',{previewId:preview.previewId,indices,selections,confirmed:true,affectBalance:balance==='true'});
      $('#kb-preview').innerHTML=''; preview=null;
      $('#kb-message').textContent=`${result.imported}건을 저장했습니다. ${card.cardName}에 연결된 지출 거래로 등록되어 거래내역과 카드 사용내역에서 조회할 수 있습니다. 다른 카드의 내역은 수집된 카드를 변경해 이어서 등록해주세요.`;
      $('#kb-preview').innerHTML='<button type="button" id="kb-view-card">등록한 카드 사용내역 보기</button>';
      $('#kb-view-card').onclick=run(()=>cardDetail(cardId));
      await loadBase(); await renderPage();
    });
  }
}
