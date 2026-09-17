let tables=[],downloadUrl;
const byId=id=>document.getElementById(id);
chrome.runtime.sendMessage({action:'status'}).then(r=>byId('connection').textContent=r.connected?'연결됨 · 조회 도구에서 내역을 읽을 수 있습니다.':'연결 대기');
byId('connect').onclick=async()=>{
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const reply=await chrome.runtime.sendMessage({action:'connect',tabId:tab.id,code:byId('code').value.trim()});
    byId('connection').textContent=reply.error||'연결되었습니다. 이 팝업을 닫아도 조회 연결은 유지됩니다.';
  }catch(e){byId('connection').textContent=e.message;}
};
byId('disconnect').onclick=async()=>{await chrome.runtime.sendMessage({action:'disconnect'});byId('connection').textContent='연결을 종료했습니다.';};
byId('read').onclick=async()=>{
  byId('read').disabled=true;byId('result').hidden=true;
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab.url);
    if(url.protocol!=='https:'||!(url.hostname==='card.kbcard.com'||url.hostname.endsWith('.kbcard.com')))throw new Error('KB국민카드 이용내역 탭을 선택한 뒤 실행해주세요.');
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureKbTables});
    if(!result?.result)throw new Error('화면을 읽지 못했습니다. KB의 파일 다운로드 기능을 이용해주세요.');
    tables=result.result.tables;
    if(!tables.length)throw new Error('표가 없습니다. 이용내역을 조회하거나 KB의 파일 다운로드 기능을 이용해주세요.');
    byId('table').replaceChildren(...tables.map((table,i)=>new Option(`${table.name} (${table.rows.length}행)`,i)));
    byId('message').textContent=`표 ${tables.length}개를 읽었습니다.`+(result.result.inaccessibleFrames?' 일부 프레임은 읽을 수 없습니다. 내역 누락 여부를 확인해주세요.':'');
    byId('result').hidden=false;select();
  }catch(e){byId('message').textContent=e.message;}
  finally{byId('read').disabled=false;}
};
function select(){
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  const table=tables[Number(byId('table').value)];
  byId('summary').textContent=table.rows[0].join(' · ').slice(0,300);
  const blob=new Blob([JSON.stringify({format:'asset-manager-kb-tables',version:1,tables:[table]})],{type:'application/json'});
  if(blob.size>5*1024*1024){byId('message').textContent='5MB를 초과합니다. 조회 기간을 줄여주세요.';byId('download').removeAttribute('href');return;}
  downloadUrl=URL.createObjectURL(blob);
  byId('download').href=downloadUrl;
  byId('download').download=`kb-이용내역-${new Date().toISOString().slice(0,10)}.kbcard.json`;
}
byId('table').onchange=select;
