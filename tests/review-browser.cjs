const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],writes=[];
 let fail=false,items=Array.from({length:17},(_,i)=>({id:'entry-'+(i+1),version:'v1',type:'CATEGORY',title:'거래 '+(i+1),description:'분류 확인',date:'2026-09-30',amount:1000,action:'classify',targetId:i+1}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://asset.test/**',async route=>{
 const r=route.request(),u=new URL(r.url()),p=u.pathname;
 if(p==='/api/review')return route.fulfill(fail?{status:500,json:{message:'test failure'}}:{json:{items}});
 if(p.startsWith('/api/review/entries/')){writes.push({p,body:r.postDataJSON()});items=items.filter(i=>i.targetId!==Number(p.split('/')[4]));return route.fulfill({status:204});}
 if(/^\/api\/transactions\/\d+$/.test(p))return route.fulfill({json:{id:Number(p.split('/').pop()),transactionDate:'2026-09-30',transactionType:'EXPENSE',amount:1000,memo:'거래',categoryId:null,origin:'MANUAL'}});
 if(p.startsWith('/api/')){assert.equal(r.method(),'GET');return route.fulfill({json:fixtures(u.href)});}
 const file=path.join(root,'src/main/resources/static',p);
 if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
 return route.fulfill({contentType:'text/html',body:expandedJsp('review.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
 });
 const ready=()=>page.waitForFunction(()=>document.querySelectorAll('.review-item').length>0);
 await page.goto('http://asset.test/review');await ready();
 assert.equal(await page.locator('.review-item').count(),15);
 await page.locator('#review-next').click();assert.equal(await page.locator('.review-item').count(),2);
 await page.locator('#review-prev').click();await page.locator('[data-review-defer]').first().click();
 assert.match(await page.locator('#review-status').innerText(),/나중에 보기 1건/);
 await page.reload();await ready();assert.match(await page.locator('#review-status').innerText(),/나중에 보기 1건/);
 await page.locator('#review-deferred').check();await page.getByRole('button',{name:'다시 표시',exact:true}).click();
 await page.locator('#review-search').fill('거래 17');assert.equal(await page.locator('.review-item').count(),1);
 await page.locator('[data-review-classify]').click();await page.locator('[name=categoryId]').selectOption('1');
 await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 await ready();assert.deepEqual(writes,[{p:'/api/review/entries/17/category',body:{categoryId:'1',expectedCategoryId:null}}]);
 await page.locator('[data-review-type=SYNC]').click();assert.equal(await page.locator('.review-item').count(),0);
 await page.locator('[data-review-type=all]').click();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 fail=true;await page.locator('#review-reload').click();await page.waitForFunction(()=>document.querySelector('#review-status').textContent.includes('불러오지 못'));
 fail=false;await page.locator('#review-reload').click();await ready();assert.deepEqual(errors,[]);
 console.log('PASS review pagination, filters, snooze persistence, category-only save, retry and responsive layouts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
