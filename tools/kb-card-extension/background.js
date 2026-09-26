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
  if(!['read','click','select','date','receipt','close-popup','benefit-page','performance-query','benefit-period'].includes(action))throw new Error('지원하지 않는 조회 명령입니다.');
  if(action!=='read'&&!Number.isInteger(args.tabId))throw new Error('조회할 KB 탭을 지정해주세요.');
  const targets=args.tabId?[Number(args.tabId)]:[...tabs];
  const results=[];
  for(const id of targets){
    if(!tabs.has(id))throw new Error('연결된 탭이 아닙니다.');
    const tab=await chrome.tabs.get(id);
    if(!isKb(tab.url)){
      if(id===tabId&&action==='read')throw new Error('연결된 KB 탭이 KB 조회 주소를 벗어났습니다. Chrome에 표시된 오류나 주소를 확인하고 KB 화면을 다시 열어주세요.');
      continue;
    }
    if(action==='benefit-page'){
      const paths={performance:'/MKB/DVIEW/HMBMCXPRIMYC0009',received:'/BON/DVIEW/HBEM0018'};
      if(id!==tabId||!Object.hasOwn(paths,args.kind))throw new Error('연결된 원본 탭의 실적·혜택 조회 화면만 열 수 있습니다.');
      const frames=await chrome.scripting.executeScript({target:{tabId:id,frameIds:[0]},world:'MAIN',func:pageCommand,args:[action,args]});
      if(!frames[0]?.result)throw new Error('KB 메뉴를 열지 못했습니다. 연결된 탭의 조회 화면을 확인해주세요.');
      results.push({tabId:id,...frames[0].result});continue;
    }
    if(action==='close-popup'){
      if(id===tabId)throw new Error('연결된 원본 탭은 닫지 않습니다.');
      await chrome.tabs.remove(id);results.push({tabId:id,closed:true});continue;
    }
    const target=action==='read'?{tabId:id,allFrames:true}:{tabId:id,frameIds:[Number.isInteger(args.frameId)?args.frameId:0]};
    const frames=await chrome.scripting.executeScript({target,world:action==='read'?'ISOLATED':'MAIN',func:pageCommand,args:[action,args]});
    for(const frame of frames){
      if(frame.result?.readError)throw new Error(frame.result.readError);
      if(frame.error)throw new Error('KB 화면 읽기 실행 오류: '+(frame.error.message||String(frame.error)));
      if(frame.result)results.push({tabId:id,frameId:frame.frameId,primary:id===tabId,...frame.result});
    }
  }
  return results;
}
function pageCommand(action,args){
  if(location.protocol!=='https:'||!(location.hostname==='card.kbcard.com'||location.hostname.endsWith('.kbcard.com')))return null;
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e.innerText||e.getAttribute('aria-label')||e.title||'').trim().slice(0,300);
  if(action==='benefit-period')return (async()=>{
    try{
      if(!['/MKB/DVIEW/HMBMCXPRIMYC0009','/BON/DVIEW/HBEM0018'].includes(location.pathname)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month))throw new Error('혜택 조회 기간을 확인해주세요.');
      const wanted=args.month.replace('-','년')+'월',normalize=s=>s.replace(/\s/g,'');
      const dates=()=>Array.from(document.querySelectorAll('a,button')).filter(e=>visible(e)&&/^\d{4}년\d{2}월$/.test(normalize(text(e))));
      let opener=dates().filter(e=>e.classList.contains('tit')||e.classList.contains('select-box__btn--sel'));
      if(opener.length!==1)throw new Error('KB 조회기간 선택 항목을 하나로 찾지 못했습니다.');
      if(normalize(text(opener[0]))!==wanted){
        opener[0].click();let options=[];
        for(let i=0;i<20;i++){options=dates().filter(e=>e!==opener[0]&&normalize(text(e))===wanted);if(options.length)break;await new Promise(r=>setTimeout(r,100));}
        if(options.length!==1)throw new Error('KB에서 선택한 월을 조회할 수 없습니다. 최근 조회 가능 기간을 확인해주세요.');
        options[0].click();
        let selected=false;
        for(let i=0;i<20;i++){
          selected=dates().some(e=>(e.classList.contains('tit')||e.classList.contains('select-box__btn--sel'))&&normalize(text(e))===wanted);
          if(selected)break;await new Promise(r=>setTimeout(r,100));
        }
        if(!selected)throw new Error('KB 조회 월이 변경되지 않았습니다. 다른 월의 결과는 저장하지 않습니다.');
      }
      if(location.pathname==='/BON/DVIEW/HBEM0018'){
        const button=document.getElementById('searchBtn');
        if(!button||!visible(button)||text(button)!=='조회')throw new Error('받은 혜택 조회 버튼을 확인해주세요.');
        button.click();
      }
      return {month:args.month,selected:true};
    }catch(e){return {readError:e.message};}
  })();
  if(action==='performance-query')return (async()=>{
    try{
      if(location.pathname!=='/MKB/DVIEW/HMBMCXPRIMYC0009')throw new Error('월별 실적충족현황 화면에서만 조회할 수 있습니다.');
      const roots=Array.from(document.querySelectorAll('main,[role="main"],#content,#contents,#container .content')).filter(visible);
      const root=roots.find(e=>!roots.some(other=>other!==e&&other.contains(e)));
      if(!root||!args.cardName)throw new Error('실적을 조회할 카드를 확인해주세요.');
      const cards=Array.from(root.querySelectorAll('a,button')).filter(e=>visible(e)&&text(e)===args.cardName);
      if(cards.length!==1)throw new Error('실적 조회 카드를 하나로 지정하지 못했습니다.');
      cards[0].click();
      const find=()=>Array.from(root.querySelectorAll('a,button,input[type="button"],input[type="submit"]')).filter(e=>visible(e)&&!e.disabled&&/^(조회|조회하기)$/.test(e.tagName==='INPUT'?e.value.trim():text(e)));
      let buttons=[];
      for(let i=0;i<30;i++){buttons=find();if(buttons.length)break;await new Promise(r=>setTimeout(r,100));}
      if(buttons.length!==1)throw new Error('카드 선택 후 조회 버튼을 하나로 찾지 못했습니다. KB 화면에서 조회 버튼을 확인해주세요.');
      const before=root.querySelector('#btnCardBeneDtail');let changed=false;
      const observer=before?new MutationObserver(records=>{
        changed=changed||records.some(r=>r.target===before||before.contains(r.target)||Array.from(r.removedNodes).some(n=>n===before||n.contains?.(before))||Array.from(r.addedNodes).some(n=>n.id==='btnCardBeneDtail'||n.querySelector?.('#btnCardBeneDtail')));
      }):null;
      observer?.observe(root,{subtree:true,childList:true,characterData:true});
      try{
        buttons[0].click();
        if(before){
          for(let i=0;i<100&&!changed;i++)await new Promise(r=>setTimeout(r,100));
          if(!changed)throw new Error('조회 후 실적 결과 갱신을 확인하지 못했습니다. 이전 월 금액은 저장하지 않습니다.');
        }
      }finally{observer?.disconnect();}
      return {queried:true,cardName:args.cardName};
    }catch(e){return {readError:e.message};}
  })();
  if(action==='benefit-page')return (async()=>{
    const names={performance:['월별 실적충족현황','카드이용실적·혜택'],received:['받은 혜택']};
    if(!Object.hasOwn(names,args.kind))throw new Error('지원하지 않는 실적·혜택 메뉴입니다.');
    const compact=s=>s.replace(/\s/g,'');
    const find=()=>{
      for(const name of names[args.kind]){
        const links=Array.from(document.querySelectorAll('a,button')).filter(e=>visible(e)&&compact(text(e))===compact(name));
        if(links.length===1)return links[0];
      }
    };
    let link=find();
    if(!link){
      const menu=document.getElementById('topTotalMenu');
      if(menu&&visible(menu))menu.click();
      for(let i=0;i<20&&!link;i++){
        await new Promise(resolve=>setTimeout(resolve,100));link=find();
      }
    }
    if(!link)throw new Error(`KB 전체메뉴에서 ‘${names[args.kind][0]}’ 링크를 하나로 찾지 못했습니다. 해당 메뉴를 직접 열고 ‘현재 KB 화면 읽기’를 눌러주세요.`);
    link.click();return {opened:true,method:'kb-menu'};
  })();
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
    try{
    let benefitDetails;
    if(args.view==='benefits'){
      const kinds={'/MKB/DVIEW/HMBMCXPRIMYC0009':'performance','/BON/DVIEW/HBEM0018':'received'};
      const kind=kinds[location.pathname];
      if(kind){
        const roots=Array.from(document.querySelectorAll('main,[role="main"],#content,#contents,#container .content')).filter(visible);
        const root=roots.find(e=>!roots.some(other=>other!==e&&other.contains(e)))||null;
        if(!root){
          const tables=Array.from(document.querySelectorAll('table')).filter(visible);
          if(kind==='received'&&tables.length){
            const content=tables.map(t=>t.innerText.trim()).join('\n');
            if(!content||content.length>80000)throw new Error('받은 혜택 표의 크기 또는 내용을 확인해주세요.');
            benefitDetails={kind,path:location.pathname,text:content};
          }else throw new Error('실적·혜택 본문 영역을 찾지 못했습니다. 해당 조회 화면을 다시 열어주세요.');
        }
        if(root){
        const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),lines=[];
        let node;
        while((node=walker.nextNode())){
          const parent=node.parentElement;
          if(!parent||!visible(parent)||parent.closest('input,textarea,select,script,style,noscript,[contenteditable],header,footer,nav,[hidden],[aria-hidden="true"]'))continue;
          const value=node.textContent.replace(/\s+/g,' ').trim();
          if(value)lines.push(value);
        }
        const content=lines.join('\n');
        if(!content)throw new Error('실적·혜택 화면에 읽을 내용이 없습니다. 로그인을 확인해주세요.');
        if(content.length>80000)throw new Error('실적·혜택 화면이 너무 큽니다. 조회 기간을 줄여주세요.');
        benefitDetails={kind,path:location.pathname,text:content};
        }
      }
    }
    const tables=Array.from(document.querySelectorAll('table')).filter(visible).map((table,i)=>({name:table.querySelector('caption')?.textContent?.trim()||`표 ${i+1}`,rows:Array.from(table.rows).filter(visible).map(r=>Array.from(r.cells).map(c=>c.innerText.trim()))})).filter(t=>t.rows.length>1);
    if(tables.some(t=>t.rows.length>2000||t.rows.some(r=>r.length>60||r.some(c=>c.length>1000))))throw new Error('조회 결과가 너무 큽니다. 기간을 줄여주세요.');
    return {title:document.title,tables,benefitDetails,capabilities:{benefits:true,benefitNavigation:true,performanceQuery:true,benefitPeriod:true},controls:Array.from(document.querySelectorAll('a,button,select,input[type="date"],input[type="month"]')).filter(visible).map(e=>({tag:e.tagName,id:e.id,text:text(e),current:e.getAttribute('aria-current')||e.className||'',options:e.tagName==='SELECT'?Array.from(e.options).map(o=>({text:o.text,value:o.value})):undefined}))};
    }catch(e){return {readError:e.message||'KB 본문을 읽지 못했습니다.'};}
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
