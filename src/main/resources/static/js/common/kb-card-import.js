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
    <div class="kb-import-shell">
    <ol class="order-progress kb-import-steps" aria-label="카드 내역 가져오기 단계"><li id="kb-step-collect" aria-current="step">1. 수집</li><li id="kb-step-map">2. 중복 확인</li><li id="kb-step-save">3. 거래 등록</li></ol>
    <p id="kb-message" class="kb-flow-message" role="status" tabindex="-1"></p>
    <section id="kb-stage-collect" class="kb-flow-stage" aria-labelledby="kb-collect-title">
    <div class="kb-flow-heading"><span class="kb-eyebrow">KB국민카드 · 이용내역</span><h3 id="kb-collect-title" tabindex="-1">새 내역만 가져오세요.</h3><p>이미 가져온 전표는 건너뜁니다.<br>거래 등록은 내역을 확인한 뒤 선택하세요.</p></div>
    <div class="kb-connect-card"><div><span class="kb-connect-dot" aria-hidden="true"></span><p id="kb-connection" role="status">Chrome 연결 확인 중…</p></div><button type="button" id="kb-existing">KB 로그인 열기 ↗</button></div>
    <div class="kb-collection-setup"><div class="kb-mode-label"><span>기본 수집 방식</span><strong id="kb-mode-title">새로 필요한 전표만</strong></div><details id="kb-collection-options"><summary>수집 방식 변경</summary><p>조회 기간은 Chrome의 KB 이용내역 화면에서 선택합니다.</p>
    <label>전표 수집 방식<select id="kb-receipt-mode"><option value="incremental">새로 필요한 전표만 (기본)</option><option value="none">이용내역만 · 전표 조회 생략</option><option value="all">선택 기간의 전표 모두 다시 조회</option></select></label>
    <p id="kb-mode-help" class="muted">취소·매입 상태 변경 확인을 위해 이용내역 목록은 전체 확인합니다. 저장한 전표 팝업은 다시 열지 않습니다.</p></details>
    <button type="button" id="kb-collect" hidden>필요한 전표 가져오기</button></div>
    <div class="kb-resume-card"><div><strong>이전에 가져온 내역</strong><p id="kb-last-summary">저장된 결과를 확인하고 있습니다.</p></div><button type="button" id="kb-latest">이어서 검토 →</button></div>
    <details class="kb-alternatives"><summary>연결 도움말 · 다른 가져오기 방법</summary>
    <details id="kb-setup"><summary>최초 연결 설정</summary>
      <p>확장 프로그램에 아래 연결코드를 한 번만 등록해주세요. 이후 앱을 다시 실행해도 자동으로 연결합니다.</p>
      <button type="button" id="kb-connect">연결 상태 확인</button><p id="kb-code"></p>
    </details>
    <details><summary>파일 또는 현재 화면에서 가져오기</summary>
    <label>파일 선택 (CSV·TSV·XLSX·확장 프로그램 파일, 5MB 이하)<input id="kb-file" type="file" accept=".csv,.tsv,.xlsx,.kbcard.json"></label>
    <button type="button" id="kb-connected-read">현재 화면만 읽기</button></details>
    <details><summary>별도 로그인 창 사용 (기존 Chrome의 인증은 공유되지 않음)</summary>
      <div class="toolbar"><button type="button" id="kb-open">별도 로그인 창 열기</button><button type="button" id="kb-capture">조회 결과 읽기</button><button type="button" id="kb-close">별도 로그인 창 종료</button></div>
    </details>
    </details></section>
    <div class="kb-collection-status"><progress id="kb-progress" hidden aria-label="이용내역 확인 진행률"></progress><div id="kb-collection-counts" class="kb-collection-counts"></div></div>
    <section id="kb-stage-map" class="kb-flow-stage" hidden aria-labelledby="kb-map-title"><div class="kb-flow-heading"><span class="kb-eyebrow">02 · 카드 연결</span><h3 id="kb-map-title" tabindex="-1">어느 카드에 등록할까요?</h3><p>카드를 선택하면 중복과 등록 가능한 내역을 확인합니다.</p></div><div id="kb-mapping"></div><div id="kb-evidence"></div></section>
    <section id="kb-stage-save" class="kb-flow-stage" hidden aria-labelledby="kb-review-title"><div class="kb-flow-heading"><span class="kb-eyebrow">03 · 최종 검토</span><h3 id="kb-review-title" tabindex="-1">등록할 거래를 확인하세요.</h3></div><div id="kb-preview"></div></section>
    </div>`, null);
  $('#editor > footer').insertAdjacentHTML('afterbegin','<div id="kb-flow-footer"><button type="button" id="kb-flow-back" hidden>이전</button><div><span id="kb-flow-hint">KB에서 조회 기간을 선택한 뒤 시작하세요.</span><button type="button" id="kb-flow-next" class="primary">새 내역 가져오기</button></div></div>');
  let tables=[], preview=null, busy=false, savedMappings=[], receiptRows=[];
  let currentStep='collect',lastCollection=null;
  const footer=()=>{
    if(!$('#kb-flow-footer'))return;
    $('#kb-flow-back').hidden=currentStep==='collect';$('#kb-flow-back').disabled=busy;
    const selected=$$('[data-kb-row]:checked').length;
    $('#kb-flow-next').disabled=busy;
    $('#kb-flow-next').textContent=busy?'처리 중…':currentStep==='collect'?($('#kb-receipt-mode').value==='all'?'전체 전표 다시 조회':$('#kb-receipt-mode').value==='none'?'이용내역만 가져오기':'새 내역 가져오기'):currentStep==='map'?'중복 확인하고 계속':preview?`선택한 ${selected}건 등록`:'다른 카드 검토';
    $('#kb-flow-hint').textContent=currentStep==='collect'?($('#kb-receipt-mode').value==='all'?'저장 여부와 관계없이 다시 조회합니다.':'선택한 기간의 내역을 확인합니다.'):currentStep==='map'?'아직 거래를 등록하지 않습니다.':preview?'선택한 거래만 등록됩니다.':'거래 등록이 완료되었습니다.';
  };
  const step=name=>{
    currentStep=name;
    ['collect','map','save'].forEach(s=>{const el=$('#kb-step-'+s);if(s===name)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');$('#kb-stage-'+s).hidden=s!==name;});
    $('.kb-import-shell').dataset.step=name;
    $('#modal-body').scrollTop=0;footer();
    $(name==='collect'?'#kb-collect-title':name==='map'?'#kb-map-title':'#kb-review-title').focus({preventScroll:true});
  };
  $('#kb-flow-back').onclick=()=>{if(!busy)step(currentStep==='save'?'map':'collect');};
  $('#kb-flow-next').onclick=()=>{
    if(busy)return;
    if(currentStep==='save'&&!preview){step('map');return;}
    $(currentStep==='collect'?'#kb-collect':currentStep==='map'?'#kb-check':'#kb-save')?.click();
  };
  step('collect');
  const modeHelp={incremental:'취소·매입 상태 변경 확인을 위해 이용내역 목록은 전체 확인합니다. 저장한 전표 팝업은 다시 열지 않습니다.',none:'전표 팝업을 열지 않고 이용내역만 가져옵니다. 전표 업종에 따른 자동 분류는 제공되지 않습니다.',all:'저장된 전표가 있어도 선택 기간의 모든 전표를 다시 엽니다. 전표 내용을 재확인할 때만 사용하세요.'};
  $('#kb-receipt-mode').onchange=()=>{
    const mode=$('#kb-receipt-mode').value;$('#kb-mode-help').textContent=modeHelp[mode];
    $('#kb-collect').textContent=mode==='none'?'이용내역만 가져오기':mode==='all'?'전체 전표 다시 가져오기':'필요한 전표 가져오기';
    $('#kb-mode-title').textContent=mode==='none'?'이용내역만':mode==='all'?'전체 전표 다시 조회':'새로 필요한 전표만';footer();
  };
  const counts=stats=>{$('#kb-collection-counts').innerHTML=[['새로 조회',stats.fetched],['저장 전표 재사용',stats.reused],['전표 확인 필요',stats.failed]].map(([label,n])=>`<div><span>${label}</span><strong>${fmt(n||0)}<small>건</small></strong></div>`).join('');};
  const act = fn => async () => {
    if(busy) return;
    busy=true; $('#kb-message').textContent='처리 중입니다…';
    footer();
    if($('#kb-save-message'))$('#kb-save-message').textContent='';
    const buttons=$$('#modal-body button').map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
    $('#kb-receipt-mode').disabled=true;
    try { await fn(); } catch(e) {
      if($('#kb-connection')===connectionNode){
        $('#kb-message').textContent=e.message;
        const target=currentStep==='save'&&$('#kb-save-message')?$('#kb-save-message'):$('#kb-message');
        target.textContent=e.message;
        target.scrollIntoView({block:'nearest'});
        target.focus({preventScroll:true});
      }
    }
    finally {
      busy=false; buttons.forEach(([b,disabled])=>b.disabled=disabled);
      if($('#kb-connection')===connectionNode)footer();
      if($('#kb-connection')===connectionNode){$('#kb-receipt-mode').disabled=false;$('#kb-progress').hidden=true;}
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
    connectionNode.dataset.connected=String(!!result.connected);
  }
  $('#kb-connect').onclick=act(async()=>{
    await checkConnection();
    if($('#kb-connection')===connectionNode)$('#kb-message').textContent=connectionNode.textContent;
  });
  checkConnection().catch(e=>{if($('#kb-connection')===connectionNode)connectionNode.textContent=e.message;});
  $('#kb-connected-read').onclick=act(async()=>loaded(await api('/kb-card/capture','POST',{})));
  $('#kb-latest').onclick=act(async()=>showCollection(lastCollection||await api('/kb-card/latest')));
  // The saved collection survives closing this dialog and restarting the app.
  act(async()=>{
    try{
      const job=await api('/kb-card/collection');
      if($('#kb-connection')!==connectionNode)return;
      if(job.state==='running'){step('collect');await followCollection();return;}
      const result=await api('/kb-card/latest');
      if($('#kb-connection')===connectionNode){lastCollection=result;$('#kb-last-summary').textContent=`${result.range} · ${result.expected}건`;$('#kb-message').textContent='';}
    }catch(e){
      if($('#kb-connection')===connectionNode){$('#kb-last-summary').textContent=e.message==='저장된 수집 결과가 없습니다.'?'아직 가져온 내역이 없습니다.':'저장된 결과 확인이 필요합니다.';$('#kb-message').textContent='';}
    }
  })();
  $('#kb-collect').onclick=act(async()=>{
    step('collect');counts({});
    await api('/kb-card/collect','POST',{receiptMode:$('#kb-receipt-mode').value});
    await followCollection();
  });
  async function followCollection(){
    $('#kb-progress').hidden=false;
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
      const p=job.progress||{};counts(p);
      if(p.expected){$('#kb-progress').max=p.expected;$('#kb-progress').value=p.collected||0;}else $('#kb-progress').removeAttribute('value');
      $('#kb-message').textContent=p.phase==='connecting'?'등록된 Chrome에 자동 연결 중입니다…':`이용내역 ${p.collected||0}/${p.expected??'?'}건 확인 · ${p.page||1}페이지 · 저장된 전표는 건너뛰고 있습니다.`;
    }
  }
  async function showCollection(result){
    if($('#kb-connection')!==connectionNode)return;
    lastCollection=result;$('#kb-last-summary').textContent=`${result.range} · ${result.expected}건`;
    if(!result?.tables?.some(t=>t.rows.length>1)){
      $('#kb-message').textContent='선택한 기간에 이용내역이 없습니다. KB에서 조회 기간을 변경해주세요.';
      $('#kb-evidence').innerHTML='';$('#kb-mapping').innerHTML='';$('#kb-preview').innerHTML='';counts({});preview=null;return;
    }
    await loaded({source:'collection',tables:result.tables,receipts:result.receipts});
    if($('#kb-connection')!==connectionNode)return;
    const receipts=result.receipts||[],warnings=result.warnings||[];
    $('#kb-collection-options').open=false;
    counts(result.stats||{fetched:receipts.length,failed:warnings.length});step('map');
    $('#kb-message').textContent=`${result.range} · 이용내역 ${result.expected}건 확인. ${result.receiptMode==='none'?'전표 조회는 생략했습니다. ':''}카드를 연결하고 중복 확인을 진행해주세요. 거래 등록은 마지막 단계에서 선택합니다.`;
    $('#kb-evidence').innerHTML=`<details><summary>카드별 수집 요약</summary>${kbCollectionSummary(result)}</details>${warnings.length?`<p class="filter-message">전표 ${warnings.length}건을 확인하지 못했습니다. 다시 가져오면 저장된 전표는 건너뛰고 실패한 전표를 재시도합니다.</p>`:''}
      <details id="kb-receipt-view"><summary>수집된 매출전표 ${receipts.length}건 보기</summary><label>전표 검색<input type="search" id="kb-receipt-search" placeholder="가맹점·거래일·승인번호"></label><div id="kb-receipt-list"></div><div class="toolbar pagination"><button type="button" id="kb-receipt-prev">이전</button><span id="kb-receipt-page" role="status"></span><button type="button" id="kb-receipt-next">다음</button></div></details>`;
    let receiptPage=0;
    const drawReceipts=()=>{
      const query=$('#kb-receipt-search').value.trim().toLocaleLowerCase();
      const filtered=receipts.filter(r=>[r.fields.merchant,r.fields.date,r.fields.approvalNumber].some(v=>String(v||'').toLocaleLowerCase().includes(query)));
      const pages=Math.max(1,Math.ceil(filtered.length/15));receiptPage=Math.max(0,Math.min(receiptPage,pages-1));
      $('#kb-receipt-list').innerHTML=filtered.slice(receiptPage*15,receiptPage*15+15).map((r,i)=>`<details data-kb-receipt="${i}"><summary>${esc(r.fields.date)} · ${esc(r.fields.merchant)} · ${esc(r.fields.total)} ${r.reused?' · 저장 전표':''}</summary><div></div></details>`).join('')||'<p class="empty">표시할 전표가 없습니다.</p>';
      $$('[data-kb-receipt]').forEach(el=>el.ontoggle=()=>{
        if(!el.open||el.dataset.rendered)return;el.dataset.rendered='true';
        const r=filtered[receiptPage*15+Number(el.dataset.kbReceipt)];
        $('div',el).innerHTML=detailGrid(Object.fromEntries(Object.entries(r.fields).map(([k,v])=>[({cardName:'카드명',cardNumber:'카드번호',date:'거래일자',approvalNumber:'승인번호',transactionType:'거래유형',approvalStatus:'승인상태',paymentMethod:'결제방법',installments:'할부',merchant:'가맹점명',industry:'업종',businessNumber:'사업자번호',amount:'금액',tax:'부가세',serviceCharge:'봉사료',total:'합계',pointsUsed:'포인트리 사용금액'})[k]||k,v])));
      });
      $('#kb-receipt-page').textContent=`${receiptPage+1} / ${pages} 페이지 · ${filtered.length}건`;
      $('#kb-receipt-prev').disabled=receiptPage===0;$('#kb-receipt-next').disabled=receiptPage===pages-1;
    };
    $('#kb-receipt-search').oninput=()=>{receiptPage=0;drawReceipts();};
    $('#kb-receipt-prev').onclick=()=>{receiptPage--;drawReceipts();};$('#kb-receipt-next').onclick=()=>{receiptPage++;drawReceipts();};drawReceipts();
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
    $('#kb-mapping').innerHTML=`<details class="kb-reading-options"><summary>표 읽기 설정</summary><label>가져올 표 <select id="kb-table">${tables.map((t,i)=>`<option value="${i}">${esc(t.name)} (${t.rows.length}행)</option>`).join('')}</select></label>
      <label>열 제목이 있는 행 <input id="kb-header" type="number" min="1" value="1"></label></details>
      <div id="kb-columns"></div>`;
    $('#kb-table').onchange=()=>{ $('#kb-header').value=1; mapping(); };
    $('#kb-header').onchange=mapping; mapping();
    step('map');
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
    $('#kb-columns').innerHTML=`<div class="kb-card-link-grid">
      ${sourceCards.length?`<label>수집된 카드 <select id="kb-source-card">${sourceCards.map((c,i)=>`<option value="${i}">${esc(c)}</option>`).join('')}</select></label>`:''}
      <label>앱에 연결할 카드 <select id="kb-card"><option value="">등록할 카드 선택</option>${own(state.cards).filter(c=>c.status==='ACTIVE').map(c=>`<option value="${c.id}">${esc(c.cardName)} · ${esc(label('OwnerCode',c.ownerCode))}</option>`).join('')}</select></label></div>
      <p id="kb-saved-mapping" class="kb-link-status"></p>
      <details><summary>자동 인식된 열 확인·수정</summary><div class="form-grid">${kbFields.map(([field,label,aliases])=>{
        const index=names.findIndex(n=>aliases.includes(String(n).replace(/\s/g,'')));
        return `<label>${label}<select id="kb-col-${field}"><option value="-1">${field==='approvalNumber'?'없음':'열 선택'}</option>${names.map((n,i)=>`<option value="${i}" ${i===index?'selected':''}>${i+1}. ${esc(n||'(빈 제목)')}</option>`).join('')}</select></label>`;
      }).join('')}</div>
      <p class="muted">승인 상태·할부개월 열이 없는 경우 자동으로 정상/일시불로 추정하지 않습니다. 화면에 해당 항목이 있는 표를 선택해주세요.</p>
      ${table(names,sheet.rows.slice(header+1,header+6).map(r=>r.map(esc)))}</details>
      <button type="button" id="kb-check" hidden>미리보기 · 중복 확인</button>`;
    $$('#kb-columns select').forEach(el=>el.onchange=invalidate);
    const applyMapping=()=>{
      invalidate();
      const saved=savedMappings.find(m=>m.sourceCard===sourceCards[Number($('#kb-source-card')?.value)]);
      $('#kb-card').value=saved?String(saved.cardId):'';
      $('#kb-card').disabled=!!saved;
      $('#kb-saved-mapping').textContent=saved
        ? `연결 저장됨 · ${saved.sourceCard} → ${state.cards.find(c=>eq(c.id,saved.cardId))?.cardName||'카드 확인 필요'} → ${accName(saved.accountId)}${saved.pointPayment?' · 포인트리 거래 등록 시 사용액 차감':''}`
        : sourceCards.length?'처음 한 번 연결하면 다음부터 자동 선택됩니다.':'이번 내역을 등록할 카드를 선택해주세요.';
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
    $('#kb-review-title').textContent='등록할 거래를 확인하세요.';
    step('save');
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
      <div class="kb-review-toolbar"><label><input type="checkbox" id="kb-select-all">등록 가능한 내역 전체 선택</label><label>표시할 내역<select id="kb-review-filter"><option value="READY">등록 가능 ${preview.rows.filter(x=>x.status==='READY').length}건</option><option value="all">전체 ${preview.rows.length}건</option><option value="other">중복·확인 필요 ${preview.rows.filter(x=>x.status!=='READY').length}건</option></select></label></div>
      <div id="kb-preview-rows">${table(['선택','이용일','가맹점 / 업종','원화 금액','결제','분류 / 근거','용돈 반영','확인 결과'],preview.rows.map(x=>[
        x.status==='READY'?`<input type="checkbox" data-kb-row="${x.index}" aria-label="${esc(x.row.merchant)} 저장">`:'—',
        esc(x.row.date),esc(x.row.merchant)+`<div class="muted">${esc(x.row.industry||'전표 업종 없음')}</div>`,krw(x.row.amount),x.row.pointPayment?'포인트리':x.row.installmentMonths===1?'일시불':x.row.installmentMonths+'개월',
        x.status==='READY'?`<select data-kb-category="${x.index}" aria-label="${esc(x.row.merchant)} 분류">${categoryOptions(x.categoryId)}</select><div class="muted">${esc(x.categoryReason||'분류를 선택해주세요.')}</div><label><input type="checkbox" data-kb-remember="${x.index}">다음부터 동일 가맹점·업종에 적용</label>`:'—',x.status==='READY'?`<select data-kb-allowance="${x.index}" aria-label="${esc(x.row.merchant)} 용돈 반영"><option value="">안 함</option><option value="HUSBAND">동구</option><option value="WIFE">윱니</option></select>`:x.sourceEntryId?`<span data-kb-assigned="${x.sourceEntryId}">${x.allowanceOwner?label('OwnerCode',x.allowanceOwner):'안 함'}</span> <select data-kb-existing="${x.sourceEntryId}" aria-label="${esc(x.row.merchant)} 용돈 연결 변경"><option value="">안 함</option><option value="HUSBAND" ${x.allowanceOwner==='HUSBAND'?'selected':''}>동구</option><option value="WIFE" ${x.allowanceOwner==='WIFE'?'selected':''}>윱니</option></select><button type="button" data-kb-assign="${x.sourceEntryId}">연결 저장</button>`:'—',statusBadge(x.reason,x.status==='READY'?'success':'neutral')]),[0,2,3,5,6,7])}</div>
      <div class="toolbar pagination"><button type="button" id="kb-preview-prev">이전</button><span id="kb-preview-page" role="status"></span><button type="button" id="kb-preview-next">다음</button></div>
      <label>등록 가능한 내역의 분류 일괄 변경 <select id="kb-category">${categoryOptions(null)}</select></label>
      <div class="toolbar"><label>선택한 전표의 용돈 반영 <select id="kb-allowance-bulk"><option value="">안 함</option><option value="HUSBAND">동구</option><option value="WIFE">윱니</option></select></label><button type="button" id="kb-allowance-apply">선택한 전표에 적용</button></div><p class="muted">용돈 반영은 기본 ‘안 함’입니다. 선택한 사람의 용돈에 이용일 기준 전체 구매액을 사용액으로 기록하며, 용돈 연결로 계좌 잔액을 추가 차감하지 않습니다.</p><details><summary>카테고리 추가</summary><label>추가할 위치 <select id="kb-new-parent"><option value="">새 대분류</option>${state.categories.filter(c=>c.active&&c.transactionType==='EXPENSE'&&!c.parentId).map(c=>`<option value="${c.id}">${esc(c.name)} 아래 중분류</option>`).join('')}</select></label><label>이름 <input id="kb-new-name" maxlength="80"></label><button type="button" id="kb-add-category">카테고리 추가</button></details>
      ${card.cardType==='DEBIT'?'<label>체크카드 연결계좌 잔액 <select id="kb-balance"><option value="">반영 방법 선택</option><option value="false">현재 잔액에 이미 반영됨 — 사용내역만 저장</option><option value="true">아직 반영되지 않음 — 사용액만큼 차감</option></select></label>':'<p class="muted">신용카드는 전체 구매액을 지출로 기록하며, 카드대금 출금은 기존 결제 처리에서 관리합니다.</p>'}
      <p id="kb-selection-summary" role="status"></p>
      <label><input type="checkbox" id="kb-confirm-card">카드·금액·분류와 잔액 반영 방법을 확인했습니다. (필수)</label>
      <p id="kb-save-message" class="error" role="alert" tabindex="-1"></p>
      <button type="button" id="kb-save" hidden>분류 확인 후 최종 등록</button>`;
    $('#kb-allowance-apply').onclick=()=>{
      const selected=$$('[data-kb-row]:checked');
      if(!selected.length){$('#kb-save-message').textContent='먼저 적용할 전표를 선택해주세요.';return;}
      selected.forEach(el=>$('[data-kb-allowance="'+el.dataset.kbRow+'"]').value=$('#kb-allowance-bulk').value);
      $('#kb-save-message').textContent='';updateSelection();
    };
    $$('[data-kb-assign]').forEach(b=>b.onclick=act(async()=>{
      const id=Number(b.dataset.kbAssign);
      const owner=b.parentElement.querySelector('[data-kb-existing]').value||null;
      await api('/allowance/source/'+id,'PUT',{ownerCode:owner});
      preview.rows.filter(x=>x.sourceEntryId===id).forEach(x=>x.allowanceOwner=owner);
      $$('[data-kb-assigned="'+id+'"]').forEach(el=>el.textContent=owner?label('OwnerCode',owner):'안 함');
      $$('[data-kb-existing="'+id+'"]').forEach(el=>el.value=owner||'');
      $('#kb-message').textContent='용돈 연결을 저장했습니다. 기존 거래는 다시 등록하지 않습니다.';
    }));
    let previewPage=0;
    const drawPreviewPage=()=>{
      const rows=$$('#kb-preview-rows tbody tr'),filter=$('#kb-review-filter').value;
      const indices=preview.rows.map((r,i)=>({r,i})).filter(({r})=>filter==='all'||(filter==='READY'?r.status==='READY':r.status!=='READY')).map(({i})=>i);
      const pages=Math.max(1,Math.ceil(indices.length/15));previewPage=Math.max(0,Math.min(previewPage,pages-1));
      const visible=new Set(indices.slice(previewPage*15,previewPage*15+15));
      rows.forEach((row,i)=>row.hidden=!visible.has(i));
      $('#kb-preview-page').textContent=`${previewPage+1} / ${pages} 페이지 · ${indices.length}건`;
      $('#kb-preview-prev').disabled=previewPage===0;$('#kb-preview-next').disabled=previewPage===pages-1;
    };
    $('#kb-preview-prev').onclick=()=>{previewPage--;drawPreviewPage();};$('#kb-preview-next').onclick=()=>{previewPage++;drawPreviewPage();};drawPreviewPage();
    $('#kb-review-filter').onchange=()=>{previewPage=0;drawPreviewPage();};
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
      footer();
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
      const selections=indices.map(index=>({index,categoryId:$(`[data-kb-category="${index}"]`).value,remember:$(`[data-kb-remember="${index}"]`).checked,allowanceOwner:$(`[data-kb-allowance="${index}"]`).value||null}));
      if(selections.some(x=>!x.categoryId))throw new Error('선택한 거래마다 지출 분류를 선택해주세요.');
      const selectedRows=indices.map(index=>preview.rows.find(x=>x.index===index).row);
      const amount=sum(selectedRows.map(row=>row.amount));
      const unclassified=selections.filter(x=>state.categories.find(c=>eq(c.id,x.categoryId))?.name==='미분류').length;
      const allowanceSummary=['HUSBAND','WIFE'].map(owner=>label('OwnerCode',owner)+' '+krw(sum(selections.filter(x=>x.allowanceOwner===owner).map(x=>preview.rows.find(r=>r.index===x.index).row.amount)))).join(' · ');
      const deduction=card.cardType==='DEBIT'&&balance==='true'?`${accName(card.accountId)}에서 ${krw(amount)} 차감`:'연결 자산 잔액 차감 없음';
      if(!await uiConfirm(`${card.cardName}\n${indices.length}건 · ${krw(amount)} 등록 (미분류 ${unclassified}건)\n${deduction}\n용돈 사용액: ${allowanceSummary}\n가맹점·업종 규칙 ${selections.filter(x=>x.remember).length}건 저장\n확인하면 거래내역과 카드 사용내역에 등록합니다.`)){
        $('#kb-message').textContent='등록을 취소했습니다. 거래와 분류 규칙은 저장하지 않았습니다.';return;
      }
      const result=await api('/kb-card/commit','POST',{previewId:preview.previewId,indices,selections,confirmed:true,affectBalance:balance==='true'});
      $('#kb-preview').innerHTML=''; preview=null;
      $('#kb-review-title').textContent='거래 등록을 마쳤습니다.';
      $('#kb-message').textContent=`${result.imported}건을 저장했습니다. ${card.cardName}에 연결된 지출 거래로 등록되어 거래내역과 카드 사용내역에서 조회할 수 있습니다. 다른 카드의 내역은 수집된 카드를 변경해 이어서 등록해주세요.`;
      $('#kb-preview').innerHTML='<button type="button" id="kb-view-card">등록한 카드 사용내역 보기</button>';
      footer();
      $('#kb-view-card').onclick=run(()=>cardDetail(cardId));
      await loadBase(); await renderPage();
    });
  }
}
