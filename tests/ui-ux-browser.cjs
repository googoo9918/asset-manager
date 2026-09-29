/** Responsive UI and keyboard checks. All data is synthetic; no application server required. */
const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.join(root,'build','ui-review');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 fs.mkdirSync(output,{recursive:true});
 try {
  const page=await browser.newPage(),errors=[],transactionQueries=[];
  let failSummary=false,emptyEntries=false,failEntries=false,saveCount=0,releaseSave=null,manyAccounts=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   if(p==='/api/accounts'&&manyAccounts) {
    const accounts=fixtures(u.href);return route.fulfill({json:[...accounts,...Array.from({length:30},(_,i)=>({...accounts[0],id:100+i,accountName:'순서 테스트 계좌 '+(i+1)}))]});
   }
   if(p==='/api/ui-test-save') {
    saveCount++;await new Promise(resolve=>{releaseSave=resolve;});return route.fulfill({json:{saved:true}});
   }
   if(p==='/api/summary'&&failSummary)return route.fulfill({status:503,json:{message:'연결을 잠시 확인해주세요.'}});
   if(p==='/api/transactions') {
    transactionQueries.push(Object.fromEntries(u.searchParams));
    if(failEntries)return route.fulfill({status:503,json:{message:'거래 조회를 다시 시도해주세요.'}});
    if(emptyEntries)return route.fulfill({json:[]});
   }
   if(p==='/api/securities/orders/settings')return route.fulfill({json:{enabled:true,environment:'DEMO'}});
   if(p==='/api/metadata') {
    const metadata=fixtures(u.href);
    return route.fulfill({json:{...metadata,AssetType:[...metadata.AssetType,{code:'SECURITIES',label:'증권'}],TransactionType:[...metadata.TransactionType,{code:'TRANSFER',label:'자산이동'}]}});
   }
   if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
   const file=path.join(root,'src/main/resources/static',p);
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
   const name=p==='/'?'dashboard':p.slice(1);
   let html=expandedJsp(name+'.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','');
   return route.fulfill({body:html,contentType:'text/html'});
  });
  const baseline=process.argv.includes('--baseline');
  const ready=()=>page.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')==='false');
  for(const width of [1440,390,320]) {
   await page.setViewportSize({width,height:960});
   for(const name of ['dashboard','securities','transactions','planned','cards','snapshots','settings','assets','cash','savings','loans']) {
    await page.goto('http://asset.test/'+(name==='dashboard'?'':name));await ready();
    if(['dashboard','securities','transactions','planned'].includes(name))await page.screenshot({path:path.join(output,`${baseline?'before':'after'}-${name}-${width}.png`),fullPage:true});
    if(!baseline) {
     assert.equal(await page.locator('#screen-retry').count(),0,`${name} failed to render at ${width}px`);
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
     assert.equal(overflow,false,`${name} at ${width}px has page overflow`);
     assert.equal(await page.locator('aside nav a[aria-current="page"]').count(),1);
    }
   }
  }
  if(baseline){console.log('Saved baseline screenshots to build/ui-review');return;}
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://asset.test/planned');await ready();
  assert.equal(await page.locator('#main-nav').isVisible(),false);
  await page.locator('#menu-toggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#main-nav').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#main-nav').isVisible(),false);
  assert.equal(await page.locator('#menu-toggle').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('#planned-agenda').isVisible(),true);
  assert.equal(await page.locator('#planned-calendar-wrap').isVisible(),false);
  await page.locator('#planned-calendar-view').click();assert.equal(await page.locator('#planned-calendar-wrap').isVisible(),true);
  await page.locator('#planned-list-view').click();await page.reload();await ready();assert.equal(await page.locator('#planned-agenda').isVisible(),true);
  await page.locator('#planned-agenda [data-action="occurrence-confirm"]').first().click();await page.locator('#modal[open]').waitFor();
  assert.match(await page.locator('#modal-body').innerText(),/출금|결제/);await page.locator('#close-modal').click();
  // A failed initial query must end loading and provide an operable retry.
  failSummary=true;await page.goto('http://asset.test/');await ready();
  assert.equal(await page.locator('#view-loading').isVisible(),false);
  assert.match(await page.locator('#content').innerText(),/불러오지 못했습니다/);
  failSummary=false;await page.locator('#screen-retry').click();await page.locator('#dashboard-metrics .metric').first().waitFor();await ready();
  assert.equal(await page.locator('#screen-retry').count(),0);
  // Phone records show essentials without horizontal scrolling, and expose additional fields on demand.
  await page.goto('http://asset.test/securities');await ready();
  await page.locator('#portfolio-search').fill('no-such-symbol');
  assert.match(await page.locator('#portfolio-table').innerText(),/표시할 종목이 없습니다/);
  await page.locator('#portfolio-search').fill('test');
  assert.equal(await page.locator('#portfolio-table tbody tr').count(),1);
  await page.locator('#portfolio-search').fill('');
  const firstRecord=page.locator('#portfolio-table tbody tr').first();
  assert.equal(await firstRecord.locator('.record-extra').first().isVisible(),false);
  await firstRecord.locator('[data-record-toggle]').click();
  assert.equal(await firstRecord.locator('.record-extra').first().isVisible(),true);
  assert.equal(await page.locator('.mobile-nav').isVisible(),true);
  assert.equal(await page.locator('.mobile-nav [aria-current="page"]').innerText(),'증권');
  await page.locator('#security-section-tabs [role="tab"]').first().focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#security-orders').isVisible(),true);
  assert.equal(await page.locator('#security-portfolio').isVisible(),false);
  await page.reload();await ready();assert.equal(await page.locator('#security-orders').isVisible(),true);
  await page.locator('#security-section-tabs a[href="#security-portfolio"]').click();
  // Desktop keeps a full table with keyboard scrolling.
  await page.setViewportSize({width:1000,height:844});
  const scroll=page.locator('#portfolio-table .table-wrap');await scroll.focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#portfolio-table .table-wrap').scrollLeft>0);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#security-section-tabs a[href="#security-orders"]').click();
  await page.locator('#stock-order-new').click();await page.locator('#stock-order-form').waitFor();
  await page.locator('#stock-order-form [name="orderType"]').selectOption('CURRENT');
  assert.match(await page.locator('#stock-order-explanation').innerText(),/현재가를 지정가/);
  assert.equal(await page.locator('#stock-order-price-label').isVisible(),false);
  const layout=await page.locator('#modal').evaluate(e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth,client:e.clientWidth}));
  assert.ok(layout.width<=390&&layout.scroll<=layout.client+1);
  const primary=await page.locator('#stock-order-preview').boundingBox();
  assert.ok(primary&&primary.y>=0&&primary.y+primary.height<=844,'Order action must stay visible on mobile');
  await page.screenshot({path:path.join(output,'after-order-form-390.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),false);
  await page.goto('http://asset.test/transactions');await ready();
  const initialFrom=await page.locator('#from').inputValue(),initialTo=await page.locator('#to').inputValue();
  await page.locator('#entries-last-month').click();await page.waitForFunction(()=>document.querySelector('#filter').disabled===false);
  assert.ok((await page.locator('#to').inputValue())<initialFrom);
  await page.locator('#query').fill('식비');await page.locator('#query').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#entry-filter-summary').textContent.includes('식비'));
  const query=transactionQueries.at(-1);assert.equal(query.q,'식비');
  await page.goto('http://asset.test/cash');await ready();
  await page.goto('http://asset.test/transactions');await ready();
  assert.equal(await page.locator('#query').inputValue(),'식비');
  assert.equal(await page.locator('#from').inputValue(),query.from);
  const queryCount=transactionQueries.length;await page.locator('#from').fill('2099-12-31');await page.locator('#filter').click();
  assert.equal(transactionQueries.length,queryCount);assert.match(await page.locator('#entry-filter-error').innerText(),/시작일/);
  await page.locator('#entries-reset').click();await page.waitForFunction(()=>document.querySelector('#filter').disabled===false);
  assert.equal(await page.locator('#from').inputValue(),initialFrom);assert.equal(await page.locator('#to').inputValue(),initialTo);assert.equal(await page.locator('#query').inputValue(),'');
  failEntries=true;await page.locator('#filter').click();await page.waitForFunction(()=>document.querySelector('#filter').disabled===false);
  assert.match(await page.locator('#entry-filter-error').innerText(),/다시 시도/);
  failEntries=false;emptyEntries=true;await page.locator('#filter').click();await page.waitForFunction(()=>document.querySelector('#entries-page').textContent==='총 0건');
  assert.match(await page.locator('#entries').innerText(),/조건에 맞는 거래/);
  // Save remains singular while pending, even with a second submit or Escape.
  await page.evaluate(()=>modal('저장 테스트','<label class="field">메모<input name="memo" value="보존할 입력" required></label>',()=>api('/ui-test-save','POST',{memo:document.querySelector('[name="memo"]').value})));
  await page.locator('#save-modal').click();await page.waitForFunction(()=>document.querySelector('#save-modal').disabled);
  await page.locator('#editor').evaluate(form=>form.dispatchEvent(new Event('submit',{cancelable:true})));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),true);assert.equal(saveCount,1);
  assert.equal(await page.locator('#close-modal').isDisabled(),true);releaseSave();await page.locator('#modal').waitFor({state:'hidden'});
  await ready();assert.equal(saveCount,1);
  // Long reorder dialogs scroll their body while dragging, retaining visible controls.
  manyAccounts=true;await page.goto('http://asset.test/cash');await ready();await page.locator('#reorder').click();await page.locator('#order-list').waitFor();
  const handle=page.locator('.drag-handle').first(),handleBox=await handle.boundingBox(),bodyBox=await page.locator('#modal-body').boundingBox();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);await page.mouse.down();
  await page.mouse.move(handleBox.x+handleBox.width/2,bodyBox.y+bodyBox.height-10,{steps:24});
  await page.mouse.move(handleBox.x+handleBox.width/2+2,bodyBox.y+bodyBox.height-8,{steps:8});
  await page.waitForFunction(()=>document.querySelector('#modal-body').scrollTop>0);await page.mouse.up();
  assert.equal(await page.locator('#save-modal').isVisible(),true);await page.locator('#cancel-modal').click();
  assert.deepEqual(errors,[]);
  console.log('PASS 11 screens at 1440/390/320px; menu, agenda, retry, keyboard scrolling, sticky order action, filters, duplicate-save protection and long-list drag scrolling');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
