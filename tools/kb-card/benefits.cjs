const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const directory=path.resolve('data/kb-card/benefits');
function checkLogin(pages){
  const root=pages.find(p=>p.primary&&p.frameId===0)||pages.find(p=>p.frameId===0)||pages[0];
  if(root&&/자동\s*로그아웃|로그아웃|로그인/.test(root.title||'')){
    throw new Error('KB 로그인 세션이 종료되었거나 로그인 화면이 열려 있습니다. 연결된 Chrome의 KB 탭에서 직접 다시 로그인한 뒤 조회해주세요. 확장 프로그램 연결과 로그인 상태는 별개이며, 연결코드를 새로 입력할 필요는 없습니다.');
  }
}
async function readBenefits(relay,args={}){
  let pages=[],failure;
  try{pages=await relay.command('read',{view:'benefits',...args});}catch(e){failure=e;}
  if(pages.some(p=>/자동\s*로그아웃|로그아웃|로그인/.test(p.title||'')))return pages;
  if(pages.some(p=>p.benefitDetails))return pages;
  // Legacy injected scripts can lose their exception and return no frame result.
  // Only explicitly identified received-benefit tables qualify for this fallback.
  const plain=await relay.command('read',args);
  if(plain.some(p=>/자동\s*로그아웃|로그아웃|로그인/.test(p.title||'')))return plain;
  const recovered=plain.map(p=>{
    const tables=(p.tables||[]).filter(t=>/^(청구할인|포인트리\s*적립|포인트리)\s*상세내역$/.test(t.name||'')||
      (/받은\s*혜택/.test(p.title||'')&&t.rows.some(r=>r.length===2&&/^(청구할인|포인트리적립)$/.test(String(r[0]).replace(/\s/g,'')))));
    if(!tables.length)return p;
    const text=tables.map(t=>[t.name,...t.rows.map(r=>r.join(' | '))].join('\n')).join('\n');
    return {...p,tables,benefitDetails:{kind:'received',path:'',text},extraction:'identified-benefit-tables'};
  });
  if(recovered.some(p=>p.benefitDetails))return recovered;
  if(failure)throw failure;
  return pages.length?pages:plain;
}
function amount(text){
  const m=String(text??'').trim().match(/^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?\s*(만원|원|점|P|마일|회)$/i);
  if(!m)return null;
  const scaled=(BigInt(m[1].replace(/,/g,''))*100n+BigInt((m[2]||'').padEnd(2,'0')))*(m[3]==='만원'?10000n:1n);
  return {value:`${scaled/100n}.${String(scaled%100n).padStart(2,'0')}`,unit:/원/.test(m[3])?'KRW':/점|p/i.test(m[3])?'POINT':m[3]==='회'?'COUNT':'MILE'};
}
function analyze(snapshot){
  const lines=snapshot.text.split('\n').map(s=>s.trim()).filter(Boolean),evidence=[];
  function metric(labels){
    const matches=[];
    for(let i=0;i<lines.length;i++)for(const label of labels){
      let value;
      if(lines[i]===label)value=amount(lines[i+1])||(/^\d[\d,]*(?:\.\d{1,2})?$/.test(lines[i+1]||'')&&lines[i+2]==='원'?amount(lines[i+1]+'원'):null);
      else if(lines[i].startsWith(label+':')||lines[i].startsWith(label+' :'))value=amount(lines[i].slice(label.length).replace(/^\s*:\s*/,''));
      if(value?.unit==='KRW'){matches.push(value.value);evidence.push({label,value:value.value});}
    }
    const unique=[...new Set(matches)];return unique.length===1?unique[0]:null;
  }
  const recognizedSpend=snapshot.kind==='performance'?metric(['실적인정금액','실적 인정금액','이용실적 금액','이번 달 실적','이번달 실적','당월 실적','실적금액','누적 이용실적']):null;
  const targetSpend=snapshot.kind==='performance'?metric(['목표 실적','목표실적','실적 기준금액','실적기준금액']):null;
  const received=[];
  for(const table of snapshot.tables||[])if(/상세/.test(table.name))for(const row of table.rows||[]){
    if(row.length!==3||!/^\d{2,4}[.-]\d{2}[.-]\d{2}$/.test(row[0]?.trim()))continue;
    const parsed=amount(row[2]);if(parsed&&row[1]?.trim())received.push({date:row[0].trim(),name:row[1].trim(),...parsed});
  }
  return {recognizedSpend,targetSpend,evidence,received,requiresReview:true};
}
async function captureBenefits(relay,archiveDirectory=directory){
  const pages=await readBenefits(relay);
  checkLogin(pages);
  if(!pages.some(p=>p.capabilities?.benefits))throw new Error('확장 프로그램 0.3.0 이상이 필요합니다. chrome://extensions에서 확장 프로그램을 새로고침해주세요. 기존 연결코드는 유지됩니다.');
  const sources=pages.filter(p=>p.benefitDetails);
  if(sources.length!==1)throw new Error('연결한 KB 탭에서 ‘월별 실적충족현황’ 또는 ‘받은 혜택’ 화면 하나를 열어주세요.');
  const source=sources[0],detail=source.benefitDetails;
  if(!['performance','received'].includes(detail.kind)||typeof detail.text!=='string'||!detail.text.trim()||detail.text.length>80000)
    throw new Error('실적·혜택 화면의 내용을 확인하지 못했습니다.');
  // This is a visible-page snapshot, not a claim that every card/month has been collected.
  const result={format:'asset-manager-kb-benefits',version:1,capturedAt:new Date().toISOString(),scope:'current-screen',
    kind:detail.kind,path:detail.path,title:source.title,text:detail.text,tables:source.tables||[],month:source.scopeMonth||null,sourceCard:source.sourceCard||null};
  const json=JSON.stringify(result,null,2);
  if(Buffer.byteLength(json)>5*1024*1024)throw new Error('실적·혜택 원본이 너무 큽니다.');
  await fs.mkdir(archiveDirectory,{recursive:true});
  const name=`benefits-${Date.now()}-${crypto.randomUUID()}.json`;
  const destination=path.join(archiveDirectory,name),temporary=destination+'.tmp';
  await fs.writeFile(temporary,json,{flag:'wx',mode:0o600});await fs.rename(temporary,destination);
  return {...result,archive:name,analysis:analyze(result)};
}
async function latestBenefits(archiveDirectory=directory){
  let names;
  try{names=await fs.readdir(archiveDirectory);}catch(e){if(e.code==='ENOENT')throw new Error('저장된 실적·혜택 화면이 없습니다.');throw e;}
  const name=names.filter(n=>/^benefits-\d+-[a-f0-9-]+\.json$/.test(n)).sort().at(-1);
  if(!name)throw new Error('저장된 실적·혜택 화면이 없습니다.');
  const file=path.join(archiveDirectory,name);
  if((await fs.stat(file)).size>5*1024*1024)throw new Error('저장된 실적·혜택 원본이 너무 큽니다.');
  const result=JSON.parse(await fs.readFile(file,'utf8'));
  if(result.format!=='asset-manager-kb-benefits')throw new Error('실적·혜택 원본 형식을 확인해주세요.');
  return {...result,archive:name,analysis:analyze(result)};
}
async function queryPerformance(relay,current,{wait,cardName}){
  if(!current.capabilities?.performanceQuery)throw new Error('실적 조회 버튼 실행을 위해 KB 확장 프로그램 0.3.3으로 새로고침해주세요. 기존 연결코드는 유지됩니다.');
  const text=current.benefitDetails.text;
  const area=text.split('카드를 선택해주세요.')[1]?.split('조회기간')[0]||'';
  const cards=(current.controls||[]).filter(c=>['A','BUTTON'].includes(c.tag)&&c.text&&area.split('\n').map(s=>s.trim()).includes(c.text));
  const names=[...new Set(cards.map(c=>c.text))].filter(n=>!cardName||n===cardName);
  if(names.length!==1)throw new Error('조회할 KB 카드가 여러 개이거나 확인되지 않았습니다. KB에서 카드를 선택하고 조회한 뒤 ‘현재 KB 화면 읽기’를 이용해주세요.');
  await relay.command('performance-query',{tabId:current.tabId,frameId:current.frameId,cardName:names[0]});
  const deadline=Date.now()+30000;
  for(let i=0;i<60&&Date.now()<deadline;i++){
    await wait(500);
    const pages=await readBenefits(relay,{tabId:current.tabId});checkLogin(pages);
    const result=pages.find(p=>p.benefitDetails?.kind==='performance');
    if(result&&analyze({kind:'performance',text:result.benefitDetails.text,tables:result.tables}).recognizedSpend!==null)return {...result,sourceCard:names[0]};
  }
  throw new Error('조회 버튼 실행 후 실적인정금액을 확인하지 못했습니다. 결과를 확인한 뒤 다시 읽어주세요.');
}
async function syncBenefits(relay,progress,{wait=ms=>new Promise(r=>setTimeout(r,ms)),archiveDirectory=directory,tracking}={}){
  const first=await relay.command('read');
  checkLogin(first);
  const root=first.find(p=>p.primary&&p.frameId===0);
  if(!root?.capabilities?.benefitNavigation)throw new Error('확장 프로그램을 새로고침하고 KB 탭에 연결해주세요. 실적·혜택 조회 기능이 필요합니다.');
  const snapshots=[],warnings=[];
  if(tracking&&!root.capabilities.benefitPeriod)throw new Error('월별 자동 조회를 위해 KB 확장 프로그램을 0.4.0으로 새로고침해주세요. 연결코드는 유지됩니다.');
  if(tracking&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(tracking.month))throw new Error('조회 월을 확인해주세요.');
  const previous=tracking?new Date(Date.UTC(Number(tracking.month.slice(0,4)),Number(tracking.month.slice(5))-2,1)).toISOString().slice(0,7):null;
  const steps=tracking?[{kind:'performance',month:previous},{kind:'performance',month:tracking.month},{kind:'received',month:tracking.month}]:[{kind:'performance'},{kind:'received'}];
  for(const {kind,month} of steps){
    try{
    progress({phase:kind,month,saved:snapshots.length});
    await relay.command('benefit-page',{tabId:root.tabId,kind});
    let current,lastError,lastPages=[];
    const deadline=Date.now()+30000;
    for(let i=0;i<60&&Date.now()<deadline;i++){
      await wait(500);
      let pages;
      try{pages=await readBenefits(relay,{tabId:root.tabId});}
      catch(e){lastError=e;continue;}
      checkLogin(pages);lastPages=pages;lastError=null;
      current=pages.find(p=>p.benefitDetails?.kind===kind);if(current)break;
    }
    if(!current){
      const screen=kind==='performance'?'월별 실적충족현황':'받은 혜택';
      if(lastError)throw new Error(`${screen} 화면 읽기 실패: ${lastError.message}`);
      if(!lastPages.length)throw new Error(`${screen} 이동 후 확장 프로그램에서 읽을 수 있는 KB 화면이 반환되지 않았습니다. Chrome의 연결된 탭에 오류 페이지가 표시되는지 확인해주세요. 확장 프로그램 0.3.1부터 KB 메뉴를 통해 이동합니다.`);
      const title=String(lastPages.find(p=>p.frameId===0)?.title||'제목 없음').slice(0,200);
      throw new Error(`${screen} 화면으로 이동했는지 확인하지 못했습니다. 현재 화면: ${title}. KB 메뉴에서 ‘${screen}’을 직접 연 뒤 ‘현재 KB 화면 읽기’를 눌러주세요.`);
    }
    if(month){await relay.command('benefit-period',{tabId:root.tabId,frameId:current.frameId,month});await wait(1000);}
    if(kind==='performance')current=await queryPerformance(relay,current,{wait,cardName:tracking?.cardName});
    else if(month){
      const pages=await readBenefits(relay,{tabId:root.tabId});checkLogin(pages);
      current=pages.find(p=>p.benefitDetails?.kind==='received');
      if(!current)throw new Error('선택한 월의 받은 혜택을 확인하지 못했습니다.');
    }
    current={...current,scopeMonth:month};
    snapshots.push(await captureBenefits({command:async()=>[current]},archiveDirectory));
    if(kind==='received'){
      const detailLinks=[...new Set((current.tables||[]).flatMap(t=>t.rows).filter(r=>r.length===2&&/청구할인|포인트리 적립/.test(r[0])).map(r=>r[1]))];
      if(!detailLinks.length)warnings.push('받은 혜택 합계를 확인하지 못해 전체 수집 여부를 확인할 수 없습니다.');
      for(const text of detailLinks){
        if(amount(text)?.value==='0.00')continue;
        if((current.controls||[]).filter(c=>c.tag==='A'&&c.text===text).length!==1){warnings.push('혜택 상세 링크를 하나로 확인하지 못했습니다.');continue;}
        await relay.command('click',{tabId:root.tabId,frameId:current.frameId,text});
        let details;
        for(let i=0;i<20;i++){
          await wait(300);
          const pages=await readBenefits(relay,{tabId:root.tabId});
          checkLogin(pages);
          details=pages.find(p=>p.benefitDetails?.kind==='received'&&p.tables?.some(t=>/상세/.test(t.name)));if(details)break;
        }
        if(!details)throw new Error('혜택 상세내역을 읽지 못했습니다. 저장된 화면을 확인해주세요.');
        const seen=new Set(),start=snapshots.length;let pageNumber=1;
        for(;;){
          const fingerprint=JSON.stringify(details.tables);
          if(seen.has(fingerprint))throw new Error('혜택 상세 페이지가 변경되지 않았습니다. 일부 내역만 읽었습니다.');
          seen.add(fingerprint);
          const snapshot=await captureBenefits({command:async()=>[{...details,scopeMonth:month}]},archiveDirectory);
          snapshots.push(snapshot);
          if(pageNumber>=100)throw new Error('혜택 상세 조회가 100페이지를 초과했습니다.');
          const next=(details.controls||[]).filter(c=>c.text===String(pageNumber+1));
          if(!next.length){
            if((details.controls||[]).some(c=>c.text==='다음'&&!/disabled/.test(c.current||'')))warnings.push('다음 페이지 묶음이 있어 받은 혜택 내역이 일부만 포함될 수 있습니다.');
            break;
          }
          if(next.length!==1)throw new Error('다음 혜택 페이지를 하나로 지정하지 못했습니다.');
          await relay.command('click',{tabId:root.tabId,frameId:details.frameId,text:String(++pageNumber)});
          let updated;
          for(let i=0;i<30;i++){
            await wait(300);const pages=await readBenefits(relay,{tabId:root.tabId});checkLogin(pages);
            updated=pages.find(p=>p.benefitDetails?.kind==='received'&&p.tables?.some(t=>/상세/.test(t.name))&&JSON.stringify(p.tables)!==fingerprint);
            if(updated)break;
          }
          if(!updated)throw new Error('혜택 상세 페이지 변경을 확인하지 못했습니다.');
          details=updated;
        }
        const rows=snapshots.slice(start).flatMap(s=>s.analysis.received),expected=amount(text);
        const cents=value=>BigInt(value.replace('.',''));
        if(!expected||rows.reduce((sum,r)=>sum+cents(r.value),0n)!==cents(expected.value))warnings.push('KB 혜택 합계와 상세 합계가 일치하지 않아 일부 내역이 누락되었을 수 있습니다.');
        if(month&&rows.some(r=>{const date=r.date.replace(/\./g,'-');return (date.length===8?'20'+date:date).slice(0,7)!==month;}))warnings.push('선택한 월과 다른 날짜의 혜택은 집계에서 제외했습니다.');
        if((details.controls||[]).filter(c=>c.text==='이전').length!==1)break;
        await relay.command('click',{tabId:root.tabId,frameId:details.frameId,text:'이전'});await wait(400);
      }
    }
    }catch(e){
      if(!snapshots.length)throw e;
      warnings.push(`${kind==='performance'?'이용실적':'받은 혜택'} 조회가 완료되지 않았습니다: ${e.message}`);
      break;
    }
  }
  const result={snapshots,warnings,scope:'displayed-card-and-period',requiresReview:true};
  if(tracking){
    const spend=month=>snapshots.find(s=>s.kind==='performance'&&s.month===month&&s.sourceCard===tracking.cardName)?.analysis.recognizedSpend??null;
    const details=snapshots.filter(s=>s.kind==='received'&&s.month===tracking.month);
    const received=details.flatMap(s=>s.analysis.received).filter(r=>{
      const date=r.date.replace(/\./g,'-');return (date.length===8?'20'+date:date).slice(0,7)===tracking.month;
    });
    result.tracking=tracking;
    result.usage={month:tracking.month,sourceCard:tracking.cardName,currentSpend:spend(tracking.month),previousSpend:spend(previous),received,
      complete:warnings.length===0&&details.length>0,warnings,archives:snapshots.map(s=>s.archive)};
  }
  return result;
}
module.exports={captureBenefits,latestBenefits,analyze,amount,syncBenefits,queryPerformance};
