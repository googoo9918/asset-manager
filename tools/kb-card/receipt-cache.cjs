const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const clean=s=>String(s??'').replace(/\s/g,'');
const sourceKey=(row,headers)=>['이용일시','이용카드명','승인번호','상태'].map(h=>row[headers.map(clean).indexOf(h)]).join('|');
function fingerprint(row,headers){
  const cells=headers.map((h,i)=>[clean(h),String(row[i]??'').replace(/\s+/g,' ').trim()]).filter(([h])=>h&&h!=='選択'&&h!=='선택');
  for(const required of ['이용일시','이용카드명','승인번호','상태','이용하신곳','이용금액'])if(!cells.some(([h,v])=>h===required&&v))return null;
  return crypto.createHash('sha256').update(JSON.stringify(cells)).digest('hex');
}
async function receiptCache(directory){
  const location=path.join(directory,'receipt-cache'),entries=new Map();
  await fs.mkdir(location,{recursive:true});
  async function put(id,receipt){
    if(!id)return;
    const target=path.join(location,id+'.json'),temporary=target+'.'+crypto.randomUUID()+'.tmp';
    await fs.writeFile(temporary,JSON.stringify({version:1,id,receipt}),{flag:'wx',mode:0o600});
    await fs.rename(temporary,target);entries.set(id,receipt);
  }
  async function get(id){
    if(!id)return null;if(entries.has(id))return entries.get(id);
    try {
      const saved=JSON.parse(await fs.readFile(path.join(location,id+'.json'),'utf8'));
      const valid=saved.version===1&&saved.id===id&&saved.receipt?.sourceKey&&saved.receipt?.approvalNumber&&saved.receipt?.fields;
      const value=valid?saved.receipt:null;entries.set(id,value);return value;
    } catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}
  }
  // Existing successful archives seed the cache once, so the first upgrade does not recrawl them.
  const marker=path.join(location,'migrated-v1');
  try {await fs.access(marker);} catch(e){
    if(e.code!=='ENOENT')throw e;
    const files=(await fs.readdir(directory)).filter(n=>/^kb-[A-Za-z0-9.-]+\.json$/.test(n)).sort();
    for(const file of files){
      let archive;
      try {archive=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));}catch(e){if(e instanceof SyntaxError)continue;throw e;}
      if(archive.format!=='asset-manager-kb-collection'||!archive.complete||!Array.isArray(archive.receipts))continue;
      for(const table of archive.tables||[]){
        if(!Array.isArray(table.rows)||!table.rows.length)continue;
        const headers=table.rows[0];
        for(const row of table.rows.slice(1)){
          const key=sourceKey(row,headers),matches=archive.receipts.filter(r=>r.sourceKey===key);
          const approval=row[headers.map(clean).indexOf('승인번호')]?.trim();
          if(matches.length===1&&matches[0].approvalNumber===approval&&matches[0].fields?.approvalNumber===approval)
            await put(fingerprint(row,headers),matches[0]);
        }
      }
    }
    await fs.writeFile(marker,new Date().toISOString(),{mode:0o600});
  }
  return {get,put};
}
module.exports={receiptCache,fingerprint};
