// Only configured performance cards appear here. Monthly sync never writes ledger entries.
let kbBenefitViews=[],kbBenefitReadBusy=false;
const kbBenefitUnits={KRW:'원',POINT:'점',MILE:'마일',COUNT:'회'};
const kbBenefitAmount=(v,unit='KRW')=>v==null?'조회 필요':fmt(v)+(kbBenefitUnits[unit]||'');
function kbReceivedBenefitView(v){
  const configured=new Set(v.configuration.plan.tiers.flatMap(t=>t.benefits.flatMap(b=>b.sourceNames.map(n=>n.trim()+'|'+b.unit))));
  const groups=new Map(),totals=new Map();
  for(const r of v.usage?.received||[]){
    const key=r.name.trim()+'|'+r.unit;if(!configured.has(key))continue;
    const group=groups.get(key)||{benefit:{name:r.name,unit:r.unit,limit:null},used:0n,remaining:null,progress:null};
    group.used+=decimal(r.value);groups.set(key,group);totals.set(r.unit,(totals.get(r.unit)||0n)+decimal(r.value));
  }
  const rows=v.appliedTier?[...v.benefits]:[];
  const covered=new Set(rows.flatMap(b=>b.benefit.sourceNames.map(n=>n.trim()+'|'+b.benefit.unit)));
  for(const [key,row] of groups)if(!covered.has(key))rows.push({...row,used:decimalString(row.used)});
  return {rows,totals:[...totals].map(([unit,total])=>kbBenefitAmount(decimalString(total),unit))};
}
async function initKbBenefits(){
  const root=$('#kb-benefit-board');if(!root)return;
  const monthInput=$('#kb-benefit-month');monthInput.value=preference('kb-benefit-month',monthNow());
  const draw=async()=>{
    const month=monthInput.value;if(!/^\d{4}-\d{2}$/.test(month))return;
    try{localStorage.setItem('kb-benefit-month',JSON.stringify(month));}catch{}
    root.setAttribute('aria-busy','true');
    try{
      const records=await api('/kb-card/benefits/tracking?month='+month);
      if($('#kb-benefit-board')!==root||monthInput.value!==month)return;
      kbBenefitViews=records;const cards=own(state.cards);
      root.innerHTML=records.filter(v=>cards.some(c=>eq(c.id,v.configuration.plan.cardId))).map(v=>{
        const p=v.configuration.plan,card=cards.find(c=>eq(c.id,p.cardId)),u=v.usage,received=kbReceivedBenefitView(v);
        return `<article class="kb-benefit-card"><div class="kb-card-heading"><h3>${esc(card.cardName)}</h3><div class="toolbar"><button type="button" data-benefit-sync="${p.cardId}" class="primary">KB 동기화</button><button type="button" data-benefit-edit="${p.cardId}">구간·혜택 설정</button></div></div>
          <p class="muted">${esc(month)} · ${esc(p.sourceCard)}</p>
          <div class="kb-metric-grid"><div><span>이번 달 인정 실적</span><strong>${kbBenefitAmount(u?.currentSpend)}</strong></div><div><span>다음 달 적용 예정 구간</span><strong>${esc(v.earnedTier?.name||(u?.currentSpend==null?'조회 필요':'구간 미달'))}</strong></div><div><span>${v.nextTier?esc(v.nextTier.name)+'까지 추가 필요':'추가 필요 실적'}</span><strong>${v.nextTier?kbBenefitAmount(v.remainingSpend):u?.currentSpend==null?'조회 필요':'최고 구간 달성'}</strong></div></div>
          <h4>이번 달 받은 혜택${received.totals.length?' · '+received.totals.join(' + ')+(u?.complete?'':' 이상'):''}</h4>
          <p class="muted">한도 적용 기준: ${v.tierMode==='MANUAL'?'직접 지정 · 이번 달만 적용':'전월 인정 실적 '+kbBenefitAmount(u?.previousSpend)} · ${esc(v.appliedTier?.name||(v.tierMode==='REVIEW'?'구간 재선택 필요':u?.previousSpend==null?'조회 필요':'구간 미달'))}</p>
          <div class="toolbar"><label>${esc(month)} 적용 구간 <select data-benefit-tier="${p.cardId}"><option value="">자동 · 전월 실적 기준</option>${v.tierMode==='REVIEW'?'<option value="!review" selected>기존 지정 구간을 다시 선택해주세요</option>':''}${p.tiers.map((t,i)=>`<option value="${i}" ${v.tierMode==='MANUAL'&&v.selectedTierName===t.name?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button type="button" data-benefit-tier-save="${p.cardId}">적용 구간 저장</button></div>
          <p class="muted">신규 발급 등으로 전월 실적과 다른 혜택 구간이 적용되면 직접 선택하세요. 선택한 달에만 적용하며 재동기화해도 유지됩니다.</p>
          <p class="error" role="alert" data-benefit-tier-error="${p.cardId}"></p>
          ${u&&!v.appliedTier?'<p class="muted">실제 받은 혜택은 실적 구간과 관계없이 표시합니다. 적용 구간이 확인되지 않아 한도·잔여액·사용률은 확인 필요로 표시합니다.</p>':''}
          ${received.rows.length?table(['혜택','받은 혜택','월 한도','남은 혜택','사용률'],received.rows.map(b=>[esc(b.benefit.name),`${kbBenefitAmount(b.used,b.benefit.unit)}${b.used!=null&&!u?.complete?' 이상':''}`,b.benefit.limit==null?'확인 필요':kbBenefitAmount(b.benefit.limit,b.benefit.unit),b.remaining==null?(b.benefit.limit==null?'확인 필요':'전체 조회 필요'):kbBenefitAmount(b.remaining,b.benefit.unit),b.progress==null?'확인 필요':`${fmt(b.progress)}% <progress max="100" value="${Number(b.progress)}" aria-label="${esc(b.benefit.name)} 사용률"></progress>`])):'<p class="muted">'+(!u?'KB 동기화 후 실제 받은 혜택을 표시합니다.':'설정한 KB 혜택명과 일치하는 수집 내역이 없습니다. 구간·혜택 설정에서 연결한 이름을 확인해주세요.')+'</p>'}
          ${u?.warnings?.length?`<p class="error" role="status">${u.warnings.map(esc).join('<br>')}</p>`:''}
          <p class="muted">${v.updatedAt?'마지막 동기화 '+esc(new Date(v.updatedAt).toLocaleString('ko-KR')):'아직 동기화하지 않았습니다.'}</p></article>`;
      }).join('')||'<div class="kb-empty"><h3>실적을 관리할 카드를 추가하세요</h3><p>StarB처럼 실적에 따라 혜택이 달라지는 카드만 등록합니다. 구간별 최소 실적과 혜택 한도를 저장하면 매월 다시 입력할 필요가 없습니다.</p></div>';
      $$('[data-benefit-edit]',root).forEach(b=>b.onclick=()=>openKbBenefitPlan(kbBenefitViews.find(v=>eq(v.configuration.plan.cardId,b.dataset.benefitEdit))));
      $$('[data-benefit-sync]',root).forEach(b=>{b.disabled=kbBenefitReadBusy;b.onclick=run(()=>syncKbBenefitPlan(Number(b.dataset.benefitSync),month));});
      $$('[data-benefit-tier-save]',root).forEach(b=>b.onclick=async()=>{
        const id=b.dataset.benefitTierSave,v=records.find(v=>eq(v.configuration.plan.cardId,id)),p=v.configuration.plan;
        const select=$(`[data-benefit-tier="${id}"]`,root),error=$(`[data-benefit-tier-error="${id}"]`,root);
        b.disabled=true;error.textContent='';
        try{
          if(select.value==='!review')throw new Error('자동 또는 적용할 구간을 선택해주세요.');
          await api('/kb-card/benefits/tracking/tier','PUT',{cardId:p.cardId,month,tierName:select.value===''?null:p.tiers[Number(select.value)].name,planMonth:p.effectiveMonth,planRevision:v.configuration.revision,revision:v.tierRevision||0});
          await draw();
        }catch(e){error.textContent=e.message;}finally{b.disabled=false;}
      });
    }catch(e){if($('#kb-benefit-board')===root)root.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
    finally{root.setAttribute('aria-busy','false');}
  };
  monthInput.onchange=run(draw);$('#kb-benefit-new').onclick=()=>openKbBenefitPlan();await draw();
}
async function syncKbBenefitPlan(cardId,month){
  if(kbBenefitReadBusy)return;kbBenefitReadBusy=true;
  const status=$('#kb-benefit-status'),buttons=$$('[data-benefit-sync]');buttons.forEach(b=>b.disabled=true);
  try{
    status.textContent='KB 연결 확인 중…';const c=await api('/kb-card/connect','POST',{});
    if(!c.connected)throw new Error('로그인된 KB 탭에서 확장 프로그램을 연결해주세요.');
    await api('/kb-card/benefits/tracking/sync','POST',{cardId,month});
    const deadline=Date.now()+240000;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,700));const job=await api('/kb-card/benefits/status');
      if(job.state==='failed')throw new Error(job.message);
      if(job.state==='done'){
        const t=job.result?.tracking;if(!t||!eq(t.cardId,cardId)||t.month!==month)throw new Error('다른 카드의 조회 결과입니다. 다시 동기화해주세요.');
        await api('/kb-card/benefits/tracking/apply','POST',{token:t.token});
        await initKbBenefits();status.textContent=job.result.warnings.length?'동기화 완료 · 일부 내역은 카드의 안내를 확인해주세요.':'동기화 완료 · 월별 실적과 혜택 사용량을 갱신했습니다.';return;
      }
      if(job.state==='idle')throw new Error('조회 도구가 재시작되었습니다. 다시 동기화해주세요.');
      status.textContent=job.progress?.phase==='performance'?`${job.progress.month||''} 인정 실적 조회 중…`:`${month} 받은 혜택 조회 중…`;
    }
    throw new Error('조회 시간이 길어지고 있습니다. KB 화면 상태를 확인해주세요.');
  }catch(e){status.textContent=e.message;throw e;}
  finally{kbBenefitReadBusy=false;$$('[data-benefit-sync]').forEach(b=>b.disabled=false);}
}
function openKbBenefitPlan(view){
  const p=view?.configuration.plan,cards=own(state.cards).filter(c=>c.status==='ACTIVE'||eq(c.id,p?.cardId));
  const suggested=cards.find(c=>/star\s*b|스타\s*b/i.test(c.cardName));
  let tiers=(p?.tiers||[{name:'1구간',minimumSpend:'',benefits:[]}]).map(t=>({...t,benefits:t.benefits.map(b=>({...b,sourceNames:[...b.sourceNames]}))}));
  modal('카드 실적 구간·혜택 설정',`<p>한 번 설정하면 다음 달에도 이어서 사용합니다. 조건이 바뀌면 적용 시작월을 변경해 새 설정으로 저장하세요.</p>
    <div class="fields"><label>관리 카드<select id="benefit-plan-card" ${p?'disabled':''}><option value="">카드 선택</option>${cards.map(c=>`<option value="${c.id}" ${eq(c.id,p?.cardId||suggested?.id)?'selected':''}>${esc(c.cardName)}</option>`).join('')}</select></label>
    <label>KB 조회 카드명<input id="benefit-plan-source" maxlength="200" value="${esc(p?.sourceCard||(suggested?'KB Star B카드':''))}" placeholder="KB Star B카드"></label>
    <label>적용 시작월<input type="month" id="benefit-plan-effective" value="${esc(p?.effectiveMonth||$('#kb-benefit-month').value)}"></label></div>
    <p class="muted">최소 실적 이상인 가장 높은 구간을 자동 적용합니다. 이번 달 혜택은 전월 실적으로, 다음 달 예상 구간은 이번 달 실적으로 계산합니다.</p>
    <div id="benefit-plan-tiers"></div><button type="button" id="benefit-tier-add">실적 구간 추가</button>
    <div class="kb-import-footer"><p id="benefit-plan-error" class="error" role="alert" tabindex="-1"></p><button type="button" id="benefit-plan-save" class="primary">구간·혜택 설정 저장</button></div>`,null);
  const read=()=>$$('[data-plan-tier]').map(el=>({name:$('[name=tier-name]',el).value.trim(),minimumSpend:$('[name=tier-min]',el).value,benefits:$$('[data-plan-benefit]',el).map(b=>({name:$('[name=benefit-name]',b).value.trim(),sourceNames:$('[name=benefit-source]',b).value.split('\n').map(s=>s.trim()).filter(Boolean),unit:$('[name=benefit-unit]',b).value,limit:$('[name=benefit-limit]',b).value}))}));
  const draw=()=>{
    $('#benefit-plan-tiers').innerHTML=tiers.map((t,i)=>`<section class="kb-benefit-item" data-plan-tier="${i}"><div class="fields"><label>구간 이름<input name="tier-name" maxlength="100" value="${esc(t.name)}"></label><label>최소 인정 실적 (원)<input name="tier-min" inputmode="decimal" value="${esc(t.minimumSpend)}" placeholder="예: 400000"></label></div>
      ${t.benefits.map((b,j)=>`<div class="kb-benefit-item" data-plan-benefit="${j}"><div class="fields"><label>혜택 이름<input name="benefit-name" maxlength="100" value="${esc(b.name)}" placeholder="음식점 할인"></label><label>월 한도<input name="benefit-limit" inputmode="decimal" value="${esc(b.limit)}"></label><label>단위<select name="benefit-unit">${Object.entries(kbBenefitUnits).map(([key,label])=>`<option value="${key}" ${key===b.unit?'selected':''}>${label}</option>`).join('')}</select></label></div><label>KB 받은 혜택명 (여러 개면 줄바꿈)<textarea name="benefit-source" rows="2" placeholder="스타B_음식점할인">${esc(b.sourceNames.join('\n'))}</textarea></label><p class="muted">KB에 표시되는 이름과 단위가 일치하는 내역을 자동 합산합니다.</p><button type="button" data-benefit-remove="${i}:${j}">혜택 삭제</button></div>`).join('')}
      <div class="toolbar"><button type="button" data-plan-add="${i}">혜택 추가</button><button type="button" data-plan-copy="${i}">이 구간 복사</button><button type="button" data-plan-remove="${i}">구간 삭제</button></div></section>`).join('');
    $$('[data-plan-add]').forEach(b=>b.onclick=()=>{tiers=read();tiers[Number(b.dataset.planAdd)].benefits.push({name:'',sourceNames:[],unit:'KRW',limit:''});draw();});
    $$('[data-plan-remove]').forEach(b=>b.onclick=()=>{tiers=read();tiers.splice(Number(b.dataset.planRemove),1);draw();});
    $$('[data-plan-copy]').forEach(b=>b.onclick=()=>{tiers=read();const copy=JSON.parse(JSON.stringify(tiers[Number(b.dataset.planCopy)]));copy.name+=' 복사';copy.minimumSpend='';tiers.push(copy);draw();});
    $$('[data-benefit-remove]').forEach(b=>b.onclick=()=>{tiers=read();const [i,j]=b.dataset.benefitRemove.split(':').map(Number);tiers[i].benefits.splice(j,1);draw();});
  };draw();
  $('#benefit-tier-add').onclick=()=>{tiers=read();tiers.push({name:`${tiers.length+1}구간`,minimumSpend:'',benefits:[]});draw();};
  $('#benefit-plan-save').onclick=async()=>{
    const button=$('#benefit-plan-save'),error=$('#benefit-plan-error');button.disabled=true;error.textContent='';
    try{
      const number=value=>{const n=String(value).replace(/,/g,'').trim();if(!/^\d{1,15}(\.\d{1,2})?$/.test(n))throw new Error('최소 실적과 혜택 한도를 0 이상으로 입력해주세요.');return n;};
      const cardId=Number($('#benefit-plan-card').value),sourceCard=$('#benefit-plan-source').value.trim(),effectiveMonth=$('#benefit-plan-effective').value;
      if(!cardId||!sourceCard||!effectiveMonth)throw new Error('카드·KB 카드명·적용 시작월을 입력해주세요.');
      const values=read().map(t=>({...t,minimumSpend:number(t.minimumSpend),benefits:t.benefits.map(b=>({...b,limit:number(b.limit)}))}));
      if(!values.length||values.some(t=>!t.name||t.benefits.some(b=>!b.name||!b.sourceNames.length)))throw new Error('구간 이름과 혜택 이름·KB 받은 혜택명을 입력해주세요.');
      await api('/kb-card/benefits/plans','PUT',{cardId,sourceCard,effectiveMonth,tiers:values,revision:p?.effectiveMonth===effectiveMonth?view.configuration.revision:0});
      $('#modal').close();await initKbBenefits();notice('구간·혜택 설정을 저장했습니다. KB 동기화로 월별 현황을 가져오세요.');
    }catch(e){error.textContent=e.message;error.focus();}finally{button.disabled=false;}
  };
}
