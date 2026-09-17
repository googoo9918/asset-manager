let socket,tabId,ping,connecting;
function isKb(url){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='card.kbcard.com'||u.hostname.endsWith('.kbcard.com'));}catch{return false;}}
// Only the tab explicitly connected by the user and its KB popups may be queried.
const tabs=new Set();
chrome.tabs.onCreated.addListener(tab=>{if(tabs.has(tab.openerTabId))tabs.add(tab.id);});
chrome.tabs.onRemoved.addListener(id=>{tabs.delete(id);if(id===tabId){tabId=null;socket?.close();}});
async function connectPair(pair,explicit=false){
  if(connecting)return connecting;
  connecting=(async()=>{
    if(!/^[A-Za-z0-9_-]{32}$/.test(pair.code||''))throw new Error('최초 연결코드를 입력해주세요.');
    let tab;
    try{tab=await chrome.tabs.get(pair.tabId);}catch{}
    if(!tab||!isKb(tab.url)){
      const candidates=(await chrome.tabs.query({url:'https://*.kbcard.com/*'})).filter(t=>!t.openerTabId);
      if(candidates.length!==1)throw new Error('연결할 KB 탭을 선택하고 확장 프로그램에서 연결해주세요.');
      tab=candidates[0];
    }
    const previous=socket;socket=null;previous?.close();clearInterval(ping);tabs.clear();tabId=tab.id;tabs.add(tabId);
    const current=new WebSocket('ws://127.0.0.1:18765/kb?code='+encodeURIComponent(pair.code));socket=current;
    current.onmessage=async event=>{
      let request;try{request=JSON.parse(event.data);}catch{return;}
      try{const result=await execute(request);if(current.readyState===1)current.send(JSON.stringify({id:request.id,result}));}
      catch(e){if(current.readyState===1)current.send(JSON.stringify({id:request.id,error:e.message}));}
    };
    current.onclose=()=>{if(socket===current){clearInterval(ping);socket=null;tabs.clear();}};
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{current.close();reject(new Error('연결 시간이 초과되었습니다.'));},8000);
      current.onopen=()=>{clearTimeout(timeout);resolve();};
      current.onerror=()=>{clearTimeout(timeout);reject(new Error('가계부 연결 도구가 실행 중인지 확인해주세요. 최초 연결코드도 확인해주세요.'));};
    });
    await chrome.storage.local.set({kbPairing:{code:pair.code,tabId,paused:false}});
    ping=setInterval(()=>{if(current.readyState===1)current.send('{"type":"ping"}');},20000);
    return {connected:true};
  })();
  try{return await connecting;}finally{connecting=null;}
}
async function reconnect(){
  if(socket?.readyState===1||connecting)return;
  const {kbPairing}=await chrome.storage.local.get('kbPairing');
  if(kbPairing&&!kbPairing.paused)await connectPair(kbPairing).catch(()=>{});
}
chrome.alarms.create('kb-reconnect',{periodInMinutes:1});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='kb-reconnect')reconnect();});
chrome.runtime.onStartup.addListener(reconnect);
chrome.runtime.onInstalled.addListener(reconnect);
chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.status==='complete'&&isKb(tab.url))reconnect();});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message.action==='connect'){
    (async()=>{
      const tab=await chrome.tabs.get(message.tabId);if(!isKb(tab.url))throw new Error('로그인된 KB국민카드 탭에서 연결해주세요.');
      const {kbPairing}=await chrome.storage.local.get('kbPairing');
      reply(await connectPair({code:message.code||kbPairing?.code,tabId:tab.id},true));
    })().catch(e=>reply({error:e.message}));return true;
  }
  if(message.action==='status'){reconnect().then(()=>reply({connected:socket?.readyState===1}));return true;}
  if(message.action==='disconnect'){
    (async()=>{const {kbPairing}=await chrome.storage.local.get('kbPairing');if(kbPairing)await chrome.storage.local.set({kbPairing:{...kbPairing,paused:true}});socket?.close();clearInterval(ping);tabs.clear();reply({connected:false});})();return true;
  }
});
reconnect();
async function execute(request){
  const action=request.action,args=request.args||{};
  if(!['read','click','select','date','receipt','close-popup'].includes(action))throw new Error('지원하지 않는 조회 명령입니다.');
  if(action!=='read'&&!Number.isInteger(args.tabId))throw new Error('조회할 KB 탭을 지정해주세요.');
  const targets=args.tabId?[Number(args.tabId)]:[...tabs];
  const results=[];
  for(const id of targets){
    if(!tabs.has(id))throw new Error('연결된 탭이 아닙니다.');
    const tab=await chrome.tabs.get(id);if(!isKb(tab.url))continue;
    if(action==='close-popup'){
      if(id===tabId)throw new Error('연결된 원본 탭은 닫지 않습니다.');
      await chrome.tabs.remove(id);results.push({tabId:id,closed:true});continue;
    }
    const target=action==='read'?{tabId:id,allFrames:true}:{tabId:id,frameIds:[Number.isInteger(args.frameId)?args.frameId:0]};
    const frames=await chrome.scripting.executeScript({target,world:action==='read'?'ISOLATED':'MAIN',func:pageCommand,args:[action,args]});
    for(const frame of frames)if(frame.result)results.push({tabId:id,frameId:frame.frameId,...frame.result});
  }
  return results;
}
function pageCommand(action,args){
  if(location.protocol!=='https:'||!(location.hostname==='card.kbcard.com'||location.hostname.endsWith('.kbcard.com')))return null;
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e.innerText||e.getAttribute('aria-label')||e.title||'').trim().slice(0,300);
  if(action==='receipt'){
    const table=Array.from(document.querySelectorAll('table')).find(t=>visible(t)&&t.querySelector('caption')?.textContent.includes('상세이용내역'));
    if(!table)throw new Error('상세이용내역 표를 찾지 못했습니다.');
    const rows=Array.from(table.rows).filter(visible),headers=Array.from(rows[0].cells).map(c=>c.innerText.replace(/\s/g,''));
    const approval=headers.indexOf('승인번호'),merchant=headers.indexOf('이용하신곳');
    const row=rows[args.rowIndex];
    if(!row||approval<0||merchant<0||row.cells[approval]?.innerText.trim()!==args.approval)throw new Error('조회 결과가 변경되었습니다. 다시 수집해주세요.');
    const link=row.cells[merchant].querySelector('a');if(!link) return {available:false};
    link.click();return {available:true};
  }
  if(action==='read'){
    const tables=Array.from(document.querySelectorAll('table')).filter(visible).map((table,i)=>({name:table.querySelector('caption')?.textContent?.trim()||`표 ${i+1}`,rows:Array.from(table.rows).filter(visible).map(r=>Array.from(r.cells).map(c=>c.innerText.trim()))})).filter(t=>t.rows.length>1);
    if(tables.some(t=>t.rows.length>2000||t.rows.some(r=>r.length>60||r.some(c=>c.length>1000))))throw new Error('조회 결과가 너무 큽니다. 기간을 줄여주세요.');
    return {title:document.title,tables,controls:Array.from(document.querySelectorAll('a,button,select,input[type="date"],input[type="month"]')).filter(visible).map(e=>({tag:e.tagName,id:e.id,text:text(e),current:e.getAttribute('aria-current')||e.className||'',options:e.tagName==='SELECT'?Array.from(e.options).map(o=>({text:o.text,value:o.value})):undefined}))};
  }
  let elements=args.id?Array.from(document.querySelectorAll('[id]')).filter(e=>e.id===args.id):Array.from(document.querySelectorAll('a,button')).filter(e=>text(e)===args.text);
  elements=elements.filter(visible);if(elements.length!==1)throw new Error('조회 항목을 하나로 지정할 수 없습니다. 화면을 다시 읽어주세요.');
  const element=elements[0];
  if(action==='click'){
    if(!['A','BUTTON'].includes(element.tagName)||/결제|신청|해지|송금|이체|인증|로그인|비밀번호|등록|변경|동의|납부/.test(text(element)))throw new Error('조회·전표·페이지 이동 항목만 자동 실행합니다.');
    element.click();
  }else if(action==='select'){
    if(element.tagName!=='SELECT'||!Array.from(element.options).some(o=>o.value===args.value))throw new Error('조회 선택 항목을 확인해주세요.');
    element.value=args.value;element.dispatchEvent(new Event('change',{bubbles:true}));
  }else{
    if(element.tagName!=='INPUT'||!['date','month'].includes(element.type)||!/^\d{4}-\d{2}(-\d{2})?$/.test(args.value))throw new Error('날짜 조회 항목만 입력할 수 있습니다.');
    element.value=args.value;element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return {done:true};
}
