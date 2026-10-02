const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[],writes=[];let owner='WIFE';
 const entry={id:1,transactionDate:'2026-10-01',transactionType:'EXPENSE',amount:35000,origin:'MANUAL',voided:false,memo:'기존 거래',attribution:'HUSBAND',categoryId:1};
 page.on('pageerror',e=>errors.push(e.message));await page.route('http://asset.test/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;
 if(p==='/api/transactions')return route.fulfill({json:[entry,{...entry,id:2,transactionType:'INCOME'},{...entry,id:3,voided:true},{...entry,id:4,origin:'AUTO'}]});
 if(p==='/api/transactions/1')return route.fulfill({json:entry});
 if(p==='/api/allowance/source/1'){if(r.method()==='GET')return route.fulfill({json:{sourceEntryId:1,ownerCode:owner,eligible:true}});writes.push(r.postDataJSON());owner=r.postDataJSON().ownerCode;return route.fulfill({status:200,body:''});}
 if(p.startsWith('/api/')){assert.equal(r.method(),'GET');return route.fulfill({json:fixtures(u.href)});}
 const f=path.join(root,'src/main/resources/static',p);if(fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({body:fs.readFileSync(f),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
 return route.fulfill({contentType:'text/html',body:expandedJsp('transactions.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
 });
 await page.goto('http://asset.test/transactions');await page.waitForSelector('[data-action=entry-allowance]');assert.equal(await page.locator('[data-action=entry-allowance]').count(),1);
 await page.locator('[data-action=entry-allowance]').click();assert.equal(await page.locator('[name=allowanceOwner]').inputValue(),'WIFE');await page.locator('[name=allowanceOwner]').selectOption('HUSBAND');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.locator('[data-action=entry-allowance]').click();assert.equal(await page.locator('[name=allowanceOwner]').inputValue(),'HUSBAND');await page.locator('[name=allowanceOwner]').selectOption('');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.deepEqual(writes,[{ownerCode:'HUSBAND'},{ownerCode:null}]);
 await page.locator('[data-action=entry-allowance]').click();for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);}assert.deepEqual(errors,[]);
 console.log('PASS transaction allowance eligibility, existing selection, reassignment/unlink and responsive dialog');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
