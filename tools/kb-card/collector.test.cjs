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
