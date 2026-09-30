const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[],writes=[];let updated=null;
 page.on('pageerror',e=>errors.push(e.message));
 const lines=Array.from({length:20},(_,i)=>({entryId:i+1,installmentId:i===0?8:null,transactionDate:'2026-09-15',description:'테스트 구매 '+i,purchaseAmount:'100',amount:'33.33',installment:1,months:3,status:'PENDING',linked:false}));
 await page.route('http://asset.test/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;
  if(p==='/api/card-billing')return route.fulfill({json:{month:'2026-10',cards:[{cardId:1,cardName:'테스트 카드',accountId:1,configured:true,period:{from:'2026-09-01',to:'2026-09-30'},dueDate:'2026-10-14',expected:'666.60',lines}],accounts:[{accountId:1,dueDate:'2026-10-14',expected:'666.60',actualAmount:null,difference:null,completeEstimate:false}]}});
  if(p==='/api/card-billing/installments/8/source'){writes.push(r.postDataJSON());return route.fulfill({json:{}});}
  if(p==='/api/cards/1'&&r.method()==='PUT'){updated=r.postDataJSON();writes.push(updated);return route.fulfill({json:updated});}
  if(p==='/api/cards'){const rows=fixtures(u.href);if(updated)Object.assign(rows[0],updated);return route.fulfill({json:rows});}
  if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
  const file=path.join(root,'src/main/resources/static',p);if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
  return route.fulfill({contentType:'text/html',body:expandedJsp('cards.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
 });
 await page.goto('http://asset.test/cards');await page.waitForSelector('[data-billing-lines] tbody tr');
 assert.equal(await page.locator('[data-billing-lines] tbody tr').count(),15);
 await page.locator('[data-billing-next]').click();assert.equal(await page.locator('[data-billing-lines] tbody tr').count(),5);
 await page.locator('[data-billing-prev]').click();
 await page.locator('[data-billing-link]').click();await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.deepEqual(writes[0],{entryId:null});
 await page.locator('#card-billing [data-action=card-edit]').click();
 await page.locator('[name=paymentDay]').fill('14');await page.locator('[name=billingMonthOffset]').selectOption('1');await page.locator('[name=billingClosingDay]').fill('31');
 assert.match(await page.locator('#billing-period-preview').innerText(),/이용분.*결제 예정/);
 await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.equal(writes[1].billingClosingDay,'31');assert.equal(writes[1].billingMonthOffset,'1');
 await page.locator('#card-billing [data-action=card-edit]').click();await page.locator('[name=billingMonthOffset]').selectOption('');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.equal(writes[2].billingClosingDay,null);assert.equal(writes[2].billingMonthOffset,null);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 assert.deepEqual(errors,[]);console.log('PASS billing statement paging, legacy link, period settings save/reset and responsive layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
