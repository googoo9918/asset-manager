const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {collect,receiptFields}=require('./collector.cjs');
const headers=['選択','이용일시','이용카드명','이용하신곳','이용금액','결제방법','가맹점정보','할인금액','적립예상포인트리','상태','결제예정일','승인번호'];
const rows=[['','2026.09.16\n12:00','카드 A','상점 A','1000원','일시불','','100원','1P','전표매입','','001'],['','2026.09.15\n12:00','카드 B','상점 B','2000원','포인트리','','0원','0P','전표매입','','002']];
const options={wait:async()=>{},archiveDirectory:path.resolve('build/kb-collector-tests')};
function fake(stuck=false){
  let page=1,receipt=null;
  return {async command(action,args={}){
    if(action==='read'){
      const source={tabId:1,frameId:0,title:'이용내역',tables:[{name:'카드이용내역',rows:[['조회기간','2026.09.01 ~ 2026.09.16'],['정상/취소(건)','국내','2/0']]},{name:'전체카드 상세이용내역',rows:[headers,rows[page-1]]}],controls:[{tag:'A',text:'1'},{tag:'A',text:'2'}]};
      return args.tabId?[source]:[source,...(receipt?[{tabId:2,frameId:0,tables:[{name:'매출전표',rows:[['승인번호','부가세','100원'],[receipt],['가맹점명'],['상점'],['승인상태','합계','1000원'],['정상매입']]}]}]:[])];
    }
    if(action==='click'){if(!stuck)page=Number(args.text);return [{done:true}];}
    if(action==='receipt'){assert.equal(args.approval,rows[page-1][11]);receipt=args.approval;return [{available:true}];}
    if(action==='close-popup'){receipt=null;return [{closed:true}];}
    throw new Error(action);
  }};
}
test('collects every page, matches receipt approvals, archives source and totals',async()=>{
  const result=await collect(fake(),()=>{},options);
  assert.equal(result.complete,true);assert.equal(result.tables[0].rows.length,3);assert.equal(result.receipts.length,2);
  assert.deepEqual(result.receipts.map(r=>r.approvalNumber),['001','002']);
  assert.equal(JSON.parse(await fs.readFile(path.join(options.archiveDirectory,result.archive))).expected,2);
});
test('stale pagination never claims complete or writes a misleading archive',async()=>{
  await assert.rejects(collect(fake(true),()=>{},{...options,withReceipts:false}),/바뀌지/);
});
test('receipt field layout preserves supply, tax and approval as distinct values',()=>{
  const fields=receiptFields({rows:[['거래일자','금액','9091원'],['2026-09-15'],['승인번호','부가세','909원'],['00001234'],['승인상태','합계','10000원'],['정상매입']]});
  assert.equal(fields.date,'2026-09-15');assert.equal(fields.approvalNumber,'00001234');assert.equal(fields.amount,'9091원');assert.equal(fields.tax,'909원');assert.equal(fields.total,'10000원');
});

async function temporaryOptions(){
  await fs.mkdir(path.resolve('build'),{recursive:true});
  return {wait:async()=>{},archiveDirectory:await fs.mkdtemp(path.resolve('build/kb-incremental-'))};
}
function manyFake(data,{missing=new Set(),failPage=0}={}){
  let page=1,receipt=null;const opened=[];
  return {opened,async command(action,args={}){
    if(action==='read'){
      const source={tabId:1,frameId:0,tables:[{name:'카드이용내역',rows:[['조회기간','test-range'],['정상/취소(건)','국내',data.length+'/0']]},{name:'전체카드 상세이용내역',rows:[headers,...data.slice((page-1)*15,page*15)]}],controls:Array.from({length:Math.ceil(data.length/15)},(_,i)=>({tag:'A',text:String(i+1)}))};
      return args.tabId?[source]:[source,...(receipt?[{tabId:2,frameId:0,tables:[{name:'매출전표',rows:[['승인번호'],[receipt],['가맹점명'],['상점']]}]}]:[])];
    }
    if(action==='click'){if(Number(args.text)===failPage)throw Error('connection lost');page=Number(args.text);return [];}
    if(action==='receipt'){opened.push(args.approval);if(missing.has(args.approval))return [{available:false}];receipt=args.approval;return [{available:true}];}
    if(action==='close-popup'){receipt=null;return [];}
    throw Error(action);
  }};
}
const sampleRows=n=>Array.from({length:n},(_,i)=>rows[0].map((v,j)=>j===11?String(i+1).padStart(8,'0'):v));
test('300 saved receipts require zero popup visits; one changed row requires one, and force/none modes are explicit',async()=>{
  const opts=await temporaryOptions(),data=sampleRows(300),first=manyFake(data);
  const initial=await collect(first,()=>{},opts);assert.equal(first.opened.length,300);assert.equal(initial.stats.fetched,300);
  const second=manyFake(data),again=await collect(second,()=>{},opts);
  assert.equal(second.opened.length,0);assert.equal(again.stats.reused,300);assert.equal(again.complete,true);assert.equal(again.receiptsComplete,true);
  data[127][9]='취소';const changed=manyFake(data),updated=await collect(changed,()=>{},opts);
  assert.deepEqual(changed.opened,[data[127][11]]);assert.equal(updated.stats.reused,299);
  const none=manyFake(data);assert.equal((await collect(none,()=>{},{...opts,receiptMode:'none'})).receipts.length,0);assert.equal(none.opened.length,0);
  const forced=manyFake(data.slice(0,2));await collect(forced,()=>{},{...opts,receiptMode:'all'});assert.equal(forced.opened.length,2);
});
test('failed receipts retry and interrupted collection reuses successes without a completed archive',async()=>{
  const opts=await temporaryOptions(),data=sampleRows(17);
  const interrupted=manyFake(data,{missing:new Set([data[2][11]]),failPage:2});
  await assert.rejects(collect(interrupted,()=>{},opts),/connection lost/);
  const retry=manyFake(data),result=await collect(retry,()=>{},opts);
  assert.equal(result.stats.reused,14);assert.equal(result.stats.fetched,3);assert.equal(result.stats.failed,0);
  assert.deepEqual(retry.opened,[data[2][11],data[15][11],data[16][11]]);
});
test('existing archives seed reuse and same approval with different amount is not reused',async()=>{
  const opts=await temporaryOptions(),data=sampleRows(1),row=data[0];
  await fs.writeFile(path.join(opts.archiveDirectory,'kb-legacy.json'),JSON.stringify({format:'asset-manager-kb-collection',complete:true,tables:[{rows:[headers,row]}],receipts:[{sourceKey:[row[1],row[2],row[11],row[9]].join('|'),approvalNumber:row[11],fields:{approvalNumber:row[11],industry:'한식'}}]}));
  const same=manyFake(data),result=await collect(same,()=>{},opts);assert.equal(same.opened.length,0);assert.equal(result.receipts[0].fields.industry,'한식');
  data[0][4]='9999원';const changed=manyFake(data);await collect(changed,()=>{},opts);assert.equal(changed.opened.length,1);
});
