/** Mocked broker/API only; never connects to KIS or a user database. */
const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 try {
  const page=await browser.newPage(),errors=[],requests=[];let orders=[],preview=null,enabled=true,loseResponse=false,missingExchange=false,expiredPreview=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(p==='/api/securities/orders/settings')return route.fulfill({json:{enabled,environment:'DEMO'}});
   if(p==='/api/securities/orders')return route.fulfill({json:orders});
   if(p==='/api/securities/holdings')return route.fulfill({json:fixtures(u.href).map(h=>({...h,exchangeCode:missingExchange?null:h.accountId===3?'NAS':'NYS'}))});
   if(p.startsWith('/api/securities/orders/')){
    if(req.method()==='POST')requests.push({path:p,body:req.postDataJSON()});
    if(p.endsWith('/preview')) {
     const body=req.postDataJSON();preview={...body,id:'preview-1',accountName:'해외 메인',environment:'DEMO',status:'PREVIEW',price:body.orderType==='MARKET'?'0':body.orderType==='CURRENT'?'102.5':body.price,quotePrice:'102.5',quotedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+120000).toISOString(),createdAt:new Date().toISOString(),filledQuantity:'0',remainingQuantity:body.quantity,message:'전송 전'};
     if(expiredPreview)preview.expiresAt=new Date(Date.now()-1000).toISOString();
     return route.fulfill({json:preview});
    }
    if(p.endsWith('/confirm')) {preview={...preview,status:'ACCEPTED',brokerOrderId:'123',message:'주문 접수'};orders=[preview];if(loseResponse)return route.abort('failed');return route.fulfill({json:preview});}
    if(p.endsWith('/sync')) {preview={...preview,status:'PARTIAL',filledQuantity:'1',remainingQuantity:'1',averageFillPrice:'102.5'};orders=[preview];return route.fulfill({json:preview});}
    if(p.endsWith('/cancel')) {preview={...preview,status:'CANCEL_PENDING'};orders=[preview];return route.fulfill({json:preview});}
    return route.fulfill({json:preview});
   }
   if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
   const file=path.join(root,'src/main/resources/static',p);
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':'text/css'});
   const html=expandedJsp('securities.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','');
   return route.fulfill({body:html,contentType:'text/html'});
  });
  const field=name=>page.locator('#stock-order-form [name="'+name+'"]');
  await page.goto('http://asset.test/securities#security-orders');await page.locator('#stock-order-new').click();
  await field('exchange').selectOption('NASD');await field('symbol').fill('aapl');await field('orderType').selectOption('CURRENT');await field('quantity').fill('2');
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('option[value="MARKET"]').evaluate(e=>e.disabled),true);assert.equal(await field('price').isDisabled(),true);
  await page.locator('#stock-order-preview').click();await page.locator('#stock-order-send').waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,0);
  assert.match(await page.locator('#modal-body').innerText(),/102\.5/);assert.match(await page.locator('#modal-body').innerText(),/205/);
  assert.equal(requests[0].body.symbol,'AAPL');assert.equal(requests[0].body.price,null);
  await page.locator('#stock-order-edit').click();await field('symbol').waitFor();
  assert.equal(await field('symbol').inputValue(),'AAPL');assert.equal(await field('quantity').inputValue(),'2');assert.equal(await field('orderType').inputValue(),'CURRENT');
  await page.locator('#stock-order-preview').click();await page.locator('#stock-order-send').waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,0);
  await page.locator('#stock-order-send').evaluate(b=>{b.click();b.click();});await page.locator('#stock-order-sync').waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,1);assert.deepEqual(requests.find(r=>r.path.endsWith('/confirm')).body,{});
  await page.locator('#stock-order-sync').click();await page.waitForFunction(()=>document.querySelector('#modal-body').textContent.includes('부분 체결'));
  await page.locator('#stock-order-cancel').click();assert.equal(requests.filter(r=>r.path.endsWith('/cancel')).length,0);
  await page.locator('#stock-order-cancel-confirm').click();await page.waitForFunction(()=>document.querySelector('#modal-body').textContent.includes('취소 접수'));
  assert.equal(requests.filter(r=>r.path.endsWith('/cancel')).length,1);assert.equal(await page.locator('#stock-order-cancel').count(),0);
  await page.locator('#close-modal').click();await page.locator('#stock-order-new').click();
  await field('symbol').fill('005930');await field('orderType').selectOption('MARKET');
  await page.locator('#stock-order-preview').click();await page.locator('#stock-order-send').waitFor();
  assert.match(await page.locator('#modal-body').innerText(),/체결 시 결정/);
  loseResponse=true;await page.locator('#stock-order-send').click();await page.locator('#stock-order-sync').waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,2); // one POST despite network failure
  await page.locator('#close-modal').click();
  orders=Array.from({length:16},(_,i)=>({...preview,id:'order-'+i}));await page.locator('#stock-order-reload').click();
  await page.waitForFunction(()=>document.querySelector('#stock-order-page').textContent.includes('16건'));
  assert.equal(await page.locator('#stock-order-list tbody tr').count(),15);await page.locator('#stock-order-next').click();assert.equal(await page.locator('#stock-order-list tbody tr').count(),1);
  // Portfolio selection requires an explicit account; never reuse its combined quantity.
  await page.locator('#security-section-tabs a[href="#security-portfolio"]').click();
  await page.locator('#portfolio-table [data-action="holding-order"]').click();await field('symbol').waitFor();
  assert.equal(await field('symbol').inputValue(),'TEST');assert.equal(await field('symbol').evaluate(e=>e.readOnly),true);
  assert.equal(await field('accountId').inputValue(),'');assert.equal(await field('quantity').inputValue(),'1');
  assert.equal(await field('orderType').inputValue(),'CURRENT');
  const before=requests.length;await page.locator('#stock-order-preview').click();assert.equal(requests.length,before);
  await field('accountId').selectOption('3');assert.equal(await field('exchange').inputValue(),'NASD');
  await field('quantity').fill('2');await field('accountId').selectOption('4');assert.equal(await field('exchange').inputValue(),'NYSE');assert.equal(await field('quantity').inputValue(),'1');
  assert.match(await page.locator('#stock-order-holding').innerText(),/보유 수량 2주/);
  await field('side').selectOption('SELL');await page.locator('#stock-order-preview').click();await page.locator('#stock-order-send').waitFor();
  assert.deepEqual(requests.at(-1).body,{accountId:4,exchange:'NYSE',symbol:'TEST',side:'SELL',orderType:'CURRENT',quantity:'1',price:null});
  assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,2);
  loseResponse=false;await page.locator('#stock-order-send').click();await page.locator('#stock-order-sync').waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,3);
  await page.locator('#close-modal').click();
  // Account detail keeps its account and symbol, including after sorting.
  await page.locator('#security-section-tabs a[href="#security-accounts"]').click();
  await page.locator('#security-list [data-action="security-detail"][data-id="4"]').first().click();
  await page.locator('#security-tab-body [data-holding-sort="value"]').click();
  await page.locator('#security-tab-body [data-action="holding-order"]').click();await field('symbol').waitFor();
  assert.equal(await field('accountId').inputValue(),'4');assert.equal(await field('accountId').isDisabled(),true);assert.equal(await field('exchange').inputValue(),'NYSE');
  await field('orderType').selectOption('LIMIT');await field('price').fill('90.125');await field('quantity').fill('2');await field('side').selectOption('SELL');
  expiredPreview=true;await page.locator('#stock-order-preview').click();await page.locator('#stock-order-send').waitFor();
  const sentBeforeExpiry=requests.filter(r=>r.path.endsWith('/confirm')).length;await page.locator('#stock-order-send').click();
  assert.match(await page.locator('#modal-error').innerText(),/만료/);assert.equal(requests.filter(r=>r.path.endsWith('/confirm')).length,sentBeforeExpiry);
  await page.locator('#stock-order-edit').click();await field('symbol').waitFor();
  assert.equal(await field('price').inputValue(),'90.125');assert.equal(await field('quantity').inputValue(),'2');assert.equal(await field('side').inputValue(),'SELL');assert.equal(await field('accountId').inputValue(),'4');
  expiredPreview=false;
  await page.locator('#close-modal').click();missingExchange=true;
  await page.locator('#security-section-tabs a[href="#security-portfolio"]').click();
  await page.locator('#portfolio-table [data-action="holding-order"]').click();await field('symbol').waitFor();await field('accountId').selectOption('3');
  assert.equal(await field('exchange').inputValue(),'');assert.equal(await field('exchange').isDisabled(),false);
  const missingBefore=requests.length;await page.locator('#stock-order-preview').click();assert.equal(requests.length,missingBefore);
  await field('exchange').selectOption('AMEX');await page.locator('#stock-order-preview').click();await page.locator('#stock-order-send').waitFor();assert.equal(requests.at(-1).body.exchange,'AMEX');
  await page.locator('#close-modal').click();
  assert.equal(await page.locator('#portfolio-table [data-action="holding-order"][data-id="CASH"]').count(),0);
  enabled=false;await page.reload();await page.waitForFunction(()=>document.querySelector('#stock-order-new')?.disabled);
  const disabledBefore=requests.length;await page.locator('#portfolio-table [data-action="holding-order"]').click();await page.locator('#modal').waitFor();
  assert.match(await page.locator('#modal-body').innerText(),/비활성화/);assert.equal(requests.length,disabledBefore);
  assert.match(await page.locator('#stock-order-settings').innerText(),/비활성화/);assert.deepEqual(errors,[]);
  console.log('PASS stock orders and holding shortcuts: account selection, exchange mapping, buy/sell confirmation, missing exchange, disabled mode');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
