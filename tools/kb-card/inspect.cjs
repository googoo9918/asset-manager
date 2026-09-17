// Interactive development probe: retains table data only in memory; outputs headers/counts, never PIN/cookies.
const readline=require('node:readline');
const {createBridge}=require('./bridge.cjs');
const bridge=createBridge();
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
(async()=>{
  await bridge.command({action:'open'});
  console.log('KB browser open. Complete PIN login and query one card. Commands: capture, close.');
  for await(const line of input){
    if(line.trim()==='close')break;
    if(line.trim()!=='capture')continue;
    try {
      const result=await bridge.command({action:'capture'});
      console.log(JSON.stringify({source:result.source,tables:result.tables.map(t=>({name:t.name,rowCount:t.rows.length,headerCandidates:t.rows.slice(0,5).map((r,i)=>({row:i+1,labels:r.filter(v=>/^(이용|승인|가맹점|금액|매출|할부|상태|취소|결제|카드|번호|일자|구분|통화|혜택|적립|할인|청구|접수|순번)/.test(v)&&v.length<40&&!/\d{4}/.test(v))}))}))}));
    }catch(e){console.log(e.message);}
  }
})().finally(()=>bridge.close());
