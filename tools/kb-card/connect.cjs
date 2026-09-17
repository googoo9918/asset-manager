const {createBridge}=require('./bridge.cjs');
const readline=require('node:readline');
const fs=require('node:fs/promises');
const path=require('node:path');
const bridge=createBridge();
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
(async()=>{
  console.log(JSON.stringify(await bridge.command({action:'connect'})));
  for await(const line of input){
    if(line.trim()==='close')break;
    try{
      const request=line.trim()==='inspect'?{action:'inspect'}:line.trim()==='capture'?{action:'capture'}:JSON.parse(line);
      const result=await bridge.command(request);
      if(request.action==='capture'){
        await fs.mkdir(path.resolve('build/kb-card'),{recursive:true});
        await fs.writeFile(path.resolve('build/kb-card/captured.json'),JSON.stringify(result));
        console.log(JSON.stringify({saved:'build/kb-card/captured.json',tables:result.tables.map(t=>({name:t.name,rows:t.rows.length}))}));
      }else if(request.action==='collection'&&result.state==='done'){
        console.log(JSON.stringify({state:result.state,archive:result.result.archive,rows:result.result.tables[0].rows.length-1,receipts:result.result.receipts.length,warnings:result.result.warnings.length,complete:result.result.complete}));
      }else if(request.action==='inspect'){
        console.log(JSON.stringify(result.map(p=>({...p,tables:p.tables?.map(t=>({name:t.name,rowCount:t.rows.length,headers:t.rows[0]}))}))));
      }else console.log(JSON.stringify(result));
    }catch(e){console.log(e.message);}
  }
})().finally(()=>bridge.close());
