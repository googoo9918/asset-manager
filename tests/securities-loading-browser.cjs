const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage();const errors=[];let failOrders=true,failHistory=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   if(p==='/api/securities/orders'&&failOrders)return route.fulfill({status:400,json:{message:'주문 조회 오류'}});
   if(p==='/api/snapshots'&&failHistory)return route.fulfill({status:503,json:{message:'추이 조회 오류'}});
   if(p==='/api/securities/holdings')return route.fulfill({json:fixtures(u.href).map(h=>({...h,quantity:'2E0',currentPrice:'5E1',dailyReturn:'0E-8',priceDate:'2026-09-25',priceFetchedAt:'2026-09-26T07:00:00+09:00'}))});
   if(p==='/api/securities/portfolio')return route.fulfill({json:fixtures(u.href).map(h=>({...h,costNative:h.symbol==='CASH'?'0E-8':h.costNative}))});
   if(p==='/api/accounts')return route.fulfill({json:fixtures(u.href).map(a=>({...a,depositUsd:'0E-8'}))});
   if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
   const file=path.join(root,'src/main/resources/static',p);
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
   return route.fulfill({contentType:'text/html',body:expandedJsp('securities.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
  });
  await page.goto('http://asset.test/securities');await page.waitForSelector('#content[aria-busy="false"]');
  assert.equal(await page.locator('#screen-retry').count(),0);
  assert.match(await page.locator('#security-list').innerText(),/해외 메인/);
  assert.match(await page.locator('#portfolio-table').innerText(),/0\.00%/);
  assert.match(await page.locator('#stock-order-list').innerText(),/주문 조회 오류/);
  assert.match(await page.locator('#trend').innerText(),/추이 조회 오류/);
  await page.locator('#security-section-tabs a[href="#security-orders"]').click();
  failOrders=false;await page.locator('#stock-order-list .section-retry').click();await page.waitForFunction(()=>document.querySelector('#stock-order-list').textContent.includes('아직 전송한 주문'));
  await page.locator('#security-section-tabs a[href="#security-trend"]').click();
  failHistory=false;await page.locator('#trend .section-retry').click();await page.locator('#trend svg').waitFor();
  for(const owner of ['HUSBAND','WIFE','JOINT']) {
   await page.locator(`[data-owner="${owner}"]`).click();await page.waitForSelector('#content[aria-busy="false"]');
   assert.equal(await page.locator('#screen-retry').count(),0);assert.equal(await page.locator('.section-retry').count(),0);
  }
  assert.deepEqual(errors,[]);console.log('PASS scientific-notation amounts, independent history/order failures, section retries and all owner filters');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
