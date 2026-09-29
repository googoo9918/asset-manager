const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {receiptCache,fingerprint:receiptFingerprint}=require('./receipt-cache.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=s=>String(s??'').replace(/\s/g,'');
function usage(page){return page.tables?.find(t=>t.name.includes('상세이용내역')&&t.rows[0]?.some(c=>clean(c)==='승인번호'));}
function key(row,headers){return ['이용일시','이용카드명','승인번호','상태'].map(h=>row[headers.indexOf(h)]).join('|');}
function receiptApproval(table){const i=table.rows.findIndex(r=>r.includes('승인번호'));return i>=0?table.rows[i+1]?.[0]?.trim():null;}
function receiptFields(table){
  const rows=table.rows,after=label=>{const i=rows.findIndex(r=>r.includes(label));return i>=0?rows[i+1]?.[rows[i].indexOf(label)]??'':'';};
  const beside=label=>{const r=rows.find(r=>r.includes(label));return r?r[r.indexOf(label)+1]??'':'';};
  return {cardName:after('카드명'),cardNumber:after('카드번호'),date:after('거래일자'),approvalNumber:after('승인번호'),
    transactionType:after('거래유형'),approvalStatus:after('승인상태'),paymentMethod:after('결제방법'),installments:after('할부'),
    merchant:after('가맹점명'),industry:after('업종'),businessNumber:after('사업자번호'),
    amount:beside('금액'),tax:beside('부가세'),serviceCharge:beside('봉사료'),total:beside('합계'),pointsUsed:beside('포인트리\n사용금액')};
}
async function collect(relay,progress,{withReceipts=true,receiptMode='incremental',wait=sleep,archiveDirectory=path.resolve('data/kb-card')}={}){
  if(!['incremental','all','none'].includes(receiptMode))throw new Error('전표 수집 방식을 확인해주세요.');
  if(!withReceipts)receiptMode='none';
  withReceipts=receiptMode!=='none';
  const cache=withReceipts?await receiptCache(archiveDirectory):null;
  let pages=await relay.command('read');
  let source=pages.find(usage);
  if(!source){
    const home=pages.find(p=>p.controls?.some(c=>c.text==='카드이용내역'));
    if(!home)throw new Error('로그인된 KB 탭에서 카드이용내역 화면을 열어주세요.');
    await relay.command('click',{tabId:home.tabId,frameId:home.frameId,text:'카드이용내역'});
    for(let i=0;i<15&&!source;i++){await wait(500);pages=await relay.command('read');source=pages.find(usage);}
  }
  if(!source)throw new Error('이용내역 표를 찾지 못했습니다. 로그인이 유지되는지 확인해주세요.');
  const tabId=source.tabId,frameId=source.frameId;
  const summary=source.tables.find(t=>t.name==='카드이용내역');
  const range=summary?.rows.find(r=>r[0]==='조회기간')?.[1]||'';
  const totalCell=summary?.rows.find(r=>r[0]==='정상/취소(건)')?.[2]||'';
  const totalMatch=totalCell.match(/^(\d+)\s*\/\s*(\d+)$/);
  const expected=totalMatch?Number(totalMatch[1])+Number(totalMatch[2]):null;
  if(expected===null)throw new Error('조회 총 건수를 확인할 수 없어 전체 수집을 중단했습니다.');
  if(expected>500)throw new Error('한 번에 500건까지 수집합니다. 조회 기간을 줄여주세요.');
  const result={format:'asset-manager-kb-collection',version:1,collectedAt:new Date().toISOString(),range,expected,summary,
    tables:[],receipts:[],warnings:[],complete:false,receiptMode,stats:{fetched:0,reused:0,failed:0}};
  const report=page=>progress({phase:'collecting',page,collected:allRows.length,expected,receipts:result.receipts.length,...result.stats});
  const table=usage(source),headers=table.rows[0],normalized=headers.map(clean),allRows=[],seen=new Set();
  const fingerprint=p=>JSON.stringify(usage(p)?.rows.slice(1));
  async function waitChanged(before){
    for(let tries=0;tries<25;tries++){
      await wait(400);
      const fresh=(await relay.command('read',{tabId})).find(p=>p.frameId===frameId&&usage(p));
      if(fresh&&fingerprint(fresh)!==before){source=fresh;return;}
    }
    throw new Error('페이지를 이동했지만 조회 결과가 바뀌지 않았습니다. 중복 수집을 중단했습니다.');
  }
  // Always restart from page 1, and verify that navigation actually changes data.
  if(source.controls.some(c=>c.tag==='A'&&c.text==='1')){
    await relay.command('click',{tabId,frameId,text:'1'});
    await wait(700);
    source=(await relay.command('read',{tabId})).find(p=>p.frameId===frameId&&usage(p))||source;
    // Page 1 may already be selected; unchanged data here is legitimate.
  }
  for(let pageNo=1;pageNo<=100;pageNo++){
    const current=usage(source);
    if(JSON.stringify(current.rows[0])!==JSON.stringify(headers))throw new Error('조회 표의 열이 변경되었습니다.');
    if(source.tables.find(t=>t.name==='카드이용내역')?.rows.find(r=>r[0]==='조회기간')?.[1]!==range)throw new Error('수집 중 조회 기간이 변경되었습니다.');
    let added=0;
    for(let rowIndex=1;rowIndex<current.rows.length;rowIndex++){
      const row=current.rows[rowIndex],approval=row[normalized.indexOf('승인번호')]?.trim();
      if(!approval)continue;
      const identity=key(row,normalized);if(seen.has(identity))continue;
      seen.add(identity);allRows.push(row);added++;
      report(pageNo);
      if(withReceipts){
        const cacheId=receiptFingerprint(row,headers),saved=receiptMode==='incremental'?await cache.get(cacheId):null;
        if(saved&&saved.sourceKey===identity&&saved.approvalNumber===approval&&saved.fields.approvalNumber===approval){
          result.receipts.push({...saved,reused:true});result.stats.reused++;report(pageNo);continue;
        }
        const beforeTabs=new Set((await relay.command('read')).map(p=>p.tabId));
        const opened=await relay.command('receipt',{tabId,frameId,rowIndex,approval});
        if(!opened.some(r=>r.available)){result.warnings.push({approval,message:'매출전표 링크 없음'});result.stats.failed++;report(pageNo);continue;}
        let receipt;
        for(let tries=0;tries<20&&!receipt;tries++){
          await wait(250);
          const candidates=await relay.command('read');
          for(const page of candidates){
            const t=page.tables?.find(t=>t.name==='매출전표'&&receiptApproval(t)===approval);
            if(t){receipt={tabId:page.tabId,table:t};break;}
          }
        }
        if(receipt){
          const entry={sourceKey:identity,approvalNumber:approval,fields:receiptFields(receipt.table),table:receipt.table,collectedAt:new Date().toISOString()};
          result.receipts.push(entry);result.stats.fetched++;
          await cache.put(cacheId,entry);
          if(receipt.tabId!==tabId&&!beforeTabs.has(receipt.tabId))await relay.command('close-popup',{tabId:receipt.tabId});
        }else {result.warnings.push({approval,message:'매출전표 응답을 확인하지 못함'});result.stats.failed++;}
        report(pageNo);
      }
    }
    if(allRows.length===expected){result.complete=true;break;}
    if(allRows.length>expected||!added)throw new Error('조회 총 건수와 수집 결과가 일치하지 않습니다.');
    const before=fingerprint(source),next=String(pageNo+1);
    if(source.controls.some(c=>c.tag==='A'&&c.text===next))await relay.command('click',{tabId,frameId,text:next});
    else if(source.controls.some(c=>c.text==='다음'))await relay.command('click',{tabId,frameId,text:'다음'});
    else throw new Error('다음 페이지를 찾지 못했습니다. 전체 수집으로 처리하지 않습니다.');
    await waitChanged(before);
  }
  if(!result.complete)throw new Error('전체 수집을 완료하지 못했습니다.');
  result.tables=[{name:'KB 전체 수집 이용내역',rows:[headers,...allRows]}];
  result.receiptsComplete=withReceipts&&result.receipts.length===allRows.length&&result.warnings.length===0;
  const directory=archiveDirectory;await fs.mkdir(directory,{recursive:true});
  result.archive=`kb-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.json`;
  const destination=path.join(directory,result.archive),temporary=destination+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  await fs.rename(temporary,destination);
  return result;
}
module.exports={collect,receiptFields,receiptApproval,usage};
