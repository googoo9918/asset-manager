const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const {captureBenefits,latestBenefits}=require('./benefits.cjs');
test('recovers identified benefit details when a legacy extraction returns no frames',async()=>{
  const directory=await fs.mkdtemp(path.resolve('build/kb-benefits-fallback-test-'));
  const relay={command:async(action,args)=>args.view?[]:[{title:'받은 혜택',capabilities:{benefits:true},tables:[
    {name:'청구할인 상세내역',rows:[['26.09.16','테스트 할인','2,000원']]},
    {name:'다른 내역',rows:[['PRIVATE_OTHER_DATA']]}
  ]}]};
  const result=await captureBenefits(relay,directory);
  assert.equal(result.kind,'received');assert.equal(result.analysis.received[0].value,'2000.00');
  assert.doesNotMatch(result.text,/PRIVATE_OTHER_DATA/);assert.equal(result.tables.length,1);
});
test('summary fallback requires both the received-benefits page title and known labels',async()=>{
  const directory=await fs.mkdtemp(path.resolve('build/kb-benefits-summary-test-'));
  const page={title:'개인>혜택>받은 혜택 | KB국민카드',capabilities:{benefits:true},tables:[{name:'표 2',rows:[['청구할인','2,000원'],['포인트리 적립','100원']]}]};
  const relay={command:async(action,args)=>args.view?[]:[page]};
  const result=await captureBenefits(relay,directory);
  assert.equal(result.kind,'received');assert.equal(result.tables.length,1);
  assert.deepEqual(result.analysis.received,[]); // Account-wide totals are not per-card details.
  page.title='거래내역';
  await assert.rejects(captureBenefits(relay,directory),/화면 하나/);
});

test('expired login is reported before navigation and immediately after a login redirect',async()=>{
  const {syncBenefits}=require('./benefits.cjs');
  const expired={primary:true,frameId:0,title:'자동로그아웃>로그인 | KB국민카드'};
  await assert.rejects(captureBenefits({command:async()=>[expired]}),/로그인 세션.*종료/);
  let calls=0;
  await assert.rejects(syncBenefits({command:async()=>{calls++;return [expired];}},()=>{}),/연결코드를 새로/);
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(syncBenefits({command:async action=>{
    calls++;
    if(calls===1)return [{primary:true,frameId:0,tabId:10,capabilities:{benefitNavigation:true}}];
    return action==='read'?[expired]:[];
  }},()=>{},{wait:async()=>{}}),/로그인 세션/);
  assert.equal(calls,3);
});

test('preserves extraction errors and distinguishes navigation failures from login expiry',async()=>{
  const {syncBenefits}=require('./benefits.cjs');
  for(const extraction of [true,false]){
    let calls=0;
    await assert.rejects(syncBenefits({command:async action=>{
      if(++calls===1)return [{primary:true,frameId:0,tabId:10,capabilities:{benefitNavigation:true}}];
      if(action==='benefit-page')return [];
      if(extraction)throw new Error('본문 영역을 찾지 못했습니다.');
      return [{frameId:0,title:'다른 조회 화면'}];
    }},()=>{},{wait:async()=>{}}),extraction?/본문 영역/:/현재 화면: 다른 조회 화면/);
  }
});
test('sync visits the two benefits pages with an explicit limited scope',async()=>{
  const {syncBenefits}=require('./benefits.cjs');
  const directory=await fs.mkdtemp(path.resolve('build/kb-benefits-sync-test-'));
  await assert.rejects(syncBenefits({command:async()=>[]},()=>{},{wait:async()=>{},archiveDirectory:directory}),/확장 프로그램/);
  let kind,queried=false;const visited=[];
  const relay={command:async(action,args)=>{
    if(action==='benefit-page'){kind=args.kind;visited.push(kind);assert.equal(args.tabId,10);return [];}
    if(action==='performance-query'){queried=true;assert.equal(args.cardName,'테스트 카드');return [{queried:true}];}
    assert.equal(action,'read');
    return [{primary:true,tabId:10,frameId:0,capabilities:{benefits:true,benefitNavigation:true,performanceQuery:true},tables:[],controls:[{tag:'A',text:'테스트 카드'}],
      ...(kind?{benefitDetails:{kind,path:kind==='performance'?'/MKB/DVIEW/HMBMCXPRIMYC0009':'/BON/DVIEW/HBEM0018',text:'카드를 선택해주세요.\n테스트 카드\n조회기간'+(queried?'\n실적인정금액\n78,900\n원':'')}}:{})}];
  }};
  const result=await syncBenefits(relay,()=>{},{wait:async()=>{},archiveDirectory:directory});
  assert.deepEqual(visited,['performance','received']);assert.equal(result.snapshots.length,2);
  assert.equal(result.scope,'displayed-card-and-period');assert.equal(result.requiresReview,true);
  assert.equal(result.snapshots[0].analysis.recognizedSpend,'78900.00');assert.equal(queried,true);
});
test('tracked sync queries previous/current months and collects every numbered benefit page',async()=>{
  const {syncBenefits}=require('./benefits.cjs');
  const directory=await fs.mkdtemp(path.resolve('build/kb-tracking-test-'));
  let kind,month,details=false,pageNumber=1;const periods=[];
  const tracking={cardId:1,cardName:'테스트 카드',month:'2026-09',token:'test'};
  const relay={command:async(action,args)=>{
    if(action==='benefit-page'){kind=args.kind;details=false;return [];}
    if(action==='benefit-period'){month=args.month;periods.push(month);return [{selected:true,month}];}
    if(action==='performance-query')return [{queried:true}];
    if(action==='click'){
      if(args.text==='5,000원'){details=true;pageNumber=1;}
      else if(args.text==='2')pageNumber=2;
      else if(args.text==='이전')details=false;
      return [];
    }
    assert.equal(action,'read');
    const table=details?{name:'청구할인 상세내역',rows:[[pageNumber===1?'26.09.10':'26.09.12','테스트_음식점할인',pageNumber===1?'2,000원':'3,000원']]}:{name:'표 2',rows:[['청구할인','5,000원']]};
    return [{primary:true,tabId:10,frameId:0,title:'KB',capabilities:{benefits:true,benefitNavigation:true,performanceQuery:true,benefitPeriod:true},
      controls:kind==='received'?(details?[{tag:'A',text:'이전'},...(pageNumber===1?[{tag:'A',text:'2'}]:[])]:[{tag:'A',text:'5,000원'}]):[{tag:'A',text:'테스트 카드'}],tables:kind==='received'?[table]:[],
      ...(kind?{benefitDetails:{kind,text:kind==='performance'?`카드를 선택해주세요.\n테스트 카드\n조회기간\n실적인정금액\n${month==='2026-08'?'400,000':'78,900'}\n원`:'받은 혜택',path:''}}:{})}];
  }};
  const result=await syncBenefits(relay,()=>{},{wait:async()=>{},archiveDirectory:directory,tracking});
  assert.deepEqual(periods,['2026-08','2026-09','2026-09']);
  assert.equal(result.usage.previousSpend,'400000.00');assert.equal(result.usage.currentSpend,'78900.00');
  assert.equal(result.usage.complete,true);assert.deepEqual(result.usage.received.map(r=>r.value),['2000.00','3000.00']);
  assert.deepEqual(result.tracking,tracking);
});

test('only explicit unambiguous performance labels and detailed benefits are structured',()=>{
  const {analyze,amount}=require('./benefits.cjs');
  assert.equal(amount(',,,원'),null);assert.equal(amount('1,23원'),null);
  assert.deepEqual(amount('30만원'),{value:'300000.00',unit:'KRW'});
  const result=analyze({kind:'performance',text:'이번 달 실적\n200,000원\n목표 실적: 300,000원',tables:[]});
  assert.equal(result.recognizedSpend,'200000.00');assert.equal(result.targetSpend,'300000.00');
  assert.equal(analyze({kind:'performance',text:'이번 달 실적\n200,000원\n실적금액\n100,000원'}).recognizedSpend,null);
  const received=analyze({kind:'received',text:'이번 달 실적\n200,000원',tables:[{name:'합계',rows:[['청구할인','1000원']]},{name:'청구할인 상세내역',rows:[['26.09.12','식당 할인','1000원'],['26.09.12','적립','987P']]}]});
  assert.equal(received.recognizedSpend,null);assert.deepEqual(received.received.map(r=>r.unit),['KRW','POINT']);
});

test('received failure keeps the captured performance and warns instead of discarding it',async()=>{
  const {syncBenefits}=require('./benefits.cjs');
  const directory=await fs.mkdtemp(path.resolve('build/kb-benefits-partial-test-'));
  let kind;
  const result=await syncBenefits({command:async(action,args)=>{
    if(action==='benefit-page'){kind=args.kind;return [];}
    if(kind==='received')return [];
    return [{primary:true,frameId:0,tabId:10,capabilities:{benefits:true,benefitNavigation:true,performanceQuery:true},controls:[{tag:'A',text:'테스트 카드'}],
      ...(kind?{benefitDetails:{kind,text:'카드를 선택해주세요.\n테스트 카드\n조회기간\n실적금액\n200,000원',path:'/MKB/DVIEW/HMBMCXPRIMYC0009'},tables:[]}:{} )}];
  }},()=>{},{archiveDirectory:directory,wait:async()=>{}});
  assert.equal(result.snapshots.length,1);assert.equal(result.snapshots[0].kind,'performance');
  assert.match(result.warnings[0],/받은 혜택 조회가 완료되지/);
  assert.match(result.warnings[0],/화면이 반환되지/);
});

test('benefit navigation uses the KB menu handler instead of replacing the URL',async()=>{
  const {chromium}=require('playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://card.kbcard.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<button id="topTotalMenu" onclick="document.querySelector('nav').hidden=false">전체메뉴</button><nav hidden><a href="#" onclick="event.preventDefault();document.body.dataset.visited='received'">받은 혜택</a><a href="#" onclick="event.preventDefault();document.body.dataset.visited='performance'">월별 실적충족현황</a></nav><main>KB 조회 화면</main>`}));
    await page.goto('https://card.kbcard.com/');
    const code=await fs.readFile(path.join(__dirname,'../kb-card-extension/background.js'),'utf8');
    const fn=code.slice(code.indexOf('function pageCommand('));
    for(const kind of ['received','performance']){
      const result=await page.evaluate(({fn,kind})=>(0,eval)('('+fn+')')('benefit-page',{kind}),{fn,kind});
      assert.equal(result.method,'kb-menu');assert.equal(await page.locator('body').getAttribute('data-visited'),kind);
      assert.equal(page.url(),'https://card.kbcard.com/');
    }
    await assert.rejects(page.evaluate(fn=>(0,eval)('('+fn+')')('benefit-page',{kind:'payment'}),fn),/지원하지 않는/);
  }finally{await browser.close();}
});
test('performance query selects the card then clicks an input query button',async()=>{
  const {chromium}=require('playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://card.kbcard.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<main><p>카드를 선택해주세요.</p><a href="#" onclick="event.preventDefault();document.querySelector('input').hidden=false">테스트 카드</a><input type="button" value="조회" hidden onclick="document.getElementById('result').innerHTML='<p>실적인정금액</p><b>78,900</b><span>원</span>'"><div id="result"></div></main>`}));
    await page.goto('https://card.kbcard.com/MKB/DVIEW/HMBMCXPRIMYC0009');
    const code=await fs.readFile(path.join(__dirname,'../kb-card-extension/background.js'),'utf8'),fn=code.slice(code.indexOf('function pageCommand('));
    const result=await page.evaluate(fn=>(0,eval)('('+fn+')')('performance-query',{cardName:'테스트 카드'}),fn);
    assert.equal(result.queried,true);
    const read=await page.evaluate(fn=>(0,eval)('('+fn+')')('read',{view:'benefits'}),fn);
    assert.equal(require('./benefits.cjs').analyze({kind:'performance',text:read.benefitDetails.text}).recognizedSpend,'78900.00');
    await page.goto('https://card.kbcard.com/other');
    const denied=await page.evaluate(fn=>(0,eval)('('+fn+')')('performance-query',{cardName:'테스트 카드'}),fn);
    assert.match(denied.readError,/월별 실적충족현황/);
  }finally{await browser.close();}
});

test('month selection uses both KB picker layouts and submits received-benefit search',async()=>{
  const {chromium}=require('playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://card.kbcard.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<main></main>'}));
    const code=await fs.readFile(path.join(__dirname,'../kb-card-extension/background.js'),'utf8'),fn=code.slice(code.indexOf('function pageCommand('));
    for(const [path,tag,cls] of [['/MKB/DVIEW/HMBMCXPRIMYC0009','a','tit'],['/BON/DVIEW/HBEM0018','button','select-box__btn--sel']]){
      await page.goto('https://card.kbcard.com'+path);
      await page.setContent(`<main><${tag} id="month" class="${cls}" onclick="document.getElementById('option').hidden=false">2026년 09월</${tag}><${tag} id="option" hidden onclick="document.getElementById('month').textContent='2026년 08월';this.hidden=true">2026년 08월</${tag}><button id="searchBtn" onclick="document.body.dataset.queried='true'">조회</button></main>`);
      const result=await page.evaluate(fn=>(0,eval)('('+fn+')')('benefit-period',{month:'2026-08'}),fn);
      assert.equal(result.selected,true);assert.equal(await page.locator('#month').textContent(),'2026년 08월');
      assert.equal(await page.locator('body').getAttribute('data-queried'),tag==='button'?'true':null);
    }
  }finally{await browser.close();}
});

test('archives only a single supported visible benefits page and reloads without Chrome',async()=>{
  const directory=await fs.mkdtemp(path.resolve('build/kb-benefits-test-'));
  await assert.rejects(latestBenefits(directory),/저장된.*없습니다/);
  await assert.rejects(captureBenefits({command:async()=>[{tables:[]}]},directory),/0.3.0/);
  await assert.rejects(captureBenefits({command:async()=>[{capabilities:{benefits:true}}]},directory),/화면 하나/);
  assert.equal((await fs.readdir(directory)).length,0);
  const source={capabilities:{benefits:true},title:'월별 실적충족현황',benefitDetails:{kind:'performance',path:'/MKB/DVIEW/HMBMCXPRIMYC0009',text:'이번 달 실적\n200,000원'},tables:[]};
  await assert.rejects(captureBenefits({command:async()=>[source,source]},directory),/화면 하나/);
  const result=await captureBenefits({command:async(action,args)=>{assert.equal(action,'read');assert.deepEqual(args,{view:'benefits'});return [source];}},directory);
  assert.equal(result.scope,'current-screen');assert.equal(result.kind,'performance');
  assert.deepEqual(await latestBenefits(directory),result);
});
test('reads non-table benefit text only on approved pages, excludes forms and hidden elements',async()=>{
  const {chromium}=require('playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://card.kbcard.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<header>HEADER_PRIVATE</header><main><h1>월별 실적충족현황</h1><div><b>이용실적</b><span>200,000원</span></div><input value="INPUT_SECRET"><textarea>TEXTAREA_SECRET</textarea><select><option>SELECT_SECRET</option></select><p hidden>HIDDEN_SECRET</p><div style="display:none">CSS_HIDDEN</div><div contenteditable>EDIT_SECRET</div><script type="application/json">SCRIPT_SECRET</script><p>목표 300,000원</p></main><footer>FOOTER_PRIVATE</footer>`}));
    const code=await fs.readFile(path.join(__dirname,'../kb-card-extension/background.js'),'utf8');
    const fn=vm.runInNewContext('('+code.slice(code.indexOf('function pageCommand('))+')');
    await page.goto('https://card.kbcard.com/MKB/DVIEW/HMBMCXPRIMYC0009');
    const read=async args=>page.evaluate(({code,args})=>(0,eval)('('+code+')')('read',args),{code:fn.toString(),args});
    assert.equal((await read({})).benefitDetails,undefined);
    const details=(await read({view:'benefits'})).benefitDetails;
    assert.equal(details.kind,'performance');assert.match(details.text,/200,000원/);assert.match(details.text,/300,000원/);
    assert.doesNotMatch(details.text,/SECRET|PRIVATE|CSS_HIDDEN/);
    await page.goto('https://card.kbcard.com/BON/DVIEW/HBEM0018');assert.equal((await read({view:'benefits'})).benefitDetails.kind,'received');
    await page.setContent('<div class="different-kb-layout"><table><caption>청구할인 상세내역</caption><tr><td>26.09.16</td><td>테스트 할인</td><td>2,000원</td></tr></table></div>');
    const fallback=await read({view:'benefits'});
    assert.equal(fallback.benefitDetails.kind,'received');assert.match(fallback.benefitDetails.text,/2,000원/);
    await page.setContent('<div>본문 없는 조회 화면</div>');
    assert.match((await read({view:'benefits'})).readError,/본문 영역/);
    await page.goto('https://card.kbcard.com/login');assert.equal((await read({view:'benefits'})).benefitDetails,undefined);
  }finally{await browser.close();}
});

