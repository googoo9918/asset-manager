// Synthetic API responses only; no financial writes to the running application.
const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],writes=[];
  let existing=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
   const r=route.request(),u=new URL(r.url()),p=u.pathname;
   if(p==='/api/securities/trades')return route.fulfill({json:existing});
   if(r.method()==='POST'&&(p.endsWith('/trades/import')||p.endsWith('/adjustments'))){writes.push({p,body:r.postDataJSON()});return route.fulfill({json:{message:'saved'}});}
   if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
   // Simulate an old cached event bundle at its former unversioned URL.
   if(p==='/js/common/events.js'&&!u.searchParams.has('v'))return route.fulfill({body:fs.readFileSync(path.join(root,'src/main/resources/static',p),'utf8').replace(/case "account-adjust":\s*return adjustAccount\(id\);/,''),contentType:'text/javascript'});
   const file=path.join(root,'src/main/resources/static',p);
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
   return route.fulfill({contentType:'text/html',body:expandedJsp(p.slice(1)+'.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
  });
  const ready=()=>page.waitForSelector('#content[aria-busy="false"]');
  await page.goto('http://asset.test/settings');await ready();
  assert.equal(await page.locator('textarea').count(),0);
  await page.locator('#import-button button').click();
  await page.locator('[name=symbol]').fill('voo');await page.locator('[name=amount]').fill('10.25');
  await page.locator('[name=externalId]').fill('DIV-001');
  await page.locator('[name=currencyCode]').selectOption('USD');
  await page.locator('#save-modal').click();assert.equal(writes.length,0);
  await page.locator('[name=exchangeRate]').fill('1350.25');
  await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(writes.length,1);assert.equal(writes[0].body[0].exchangeRate,'1350.25');
  assert.equal(writes[0].body[0].symbol,'VOO');assert.equal(writes[0].body[0].amount,'10.25');
  existing=[{externalId:'DIV-001'}];
  await page.locator('#import-button button').click();
  await page.locator('[name=tradeType]').selectOption('DEPOSIT');
  await page.locator('[name=amount]').fill('50000');await page.locator('[name=externalId]').fill('DIV-001');
  await page.locator('#save-modal').click();await page.waitForFunction(()=>document.querySelector('#modal-error').textContent.includes('이미 기록'));
  assert.equal(writes.length,1);
  await page.locator('[name=externalId]').fill('DEPOSIT-002');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.equal(writes[1].body[0].exchangeRate,'1');assert.equal(writes[1].body[0].quantity,'0');
  await page.goto('http://asset.test/cash');await ready();
  await page.locator('[data-action=account-adjust]').first().click();
  assert.match(await page.locator('#modal-body').innerText(),/차액이 아닌 실제 잔액/);
  await page.locator('[name=balance]').fill('1000000');await page.locator('[name=reason]').fill('실제 잔액 확인');
  await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
  assert.deepEqual(writes[2].body,{balance:'1000000',reason:'실제 잔액 확인'});
  await page.goto('http://asset.test/savings');await ready();
  await page.locator('[data-action=account-adjust]').first().click();
  assert.equal(await page.locator('[name=balance]').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS manual dividend/deposit form, USD validation, duplicate guard, KRW rate and direct cash adjustment');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
