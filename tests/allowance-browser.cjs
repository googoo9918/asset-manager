const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[],writes=[];let requests=[];
 const date=new Date().toISOString().slice(0,10);
 let items=Array.from({length:17},(_,i)=>({id:i+1,date,ownerCode:'HUSBAND',amount:'-1000',memo:'전표 '+i,sourceEntryId:i+100,currentEntryId:i+100,sourceCancelled:false}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://asset.test/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;
 if(p.startsWith('/api/allowance')){
  if(r.method()==='GET'){requests.push(u.search);const rows=items.filter(x=>u.searchParams.get('owner')==='JOINT'||x.ownerCode===u.searchParams.get('owner'));return route.fulfill({json:{items:rows,summaries:[{ownerCode:'HUSBAND',opening:'0',added:'800000',used:'17000',balance:'783000'}]}});}
  const body=r.method()==='DELETE'?null:r.postDataJSON();writes.push({p,method:r.method(),body});
  if(p==='/api/allowance'){items.unshift({id:50,...body,date:body.recordDate});}
  else if(p.startsWith('/api/allowance/source/')){items.find(x=>x.sourceEntryId===Number(p.split('/').pop())).ownerCode=body.ownerCode;}
  else if(r.method()==='DELETE')items=items.filter(x=>x.id!==Number(p.split('/').pop()));
  else Object.assign(items.find(x=>x.id===Number(p.split('/').pop())),body,{date:body.recordDate});
  return route.fulfill({status:200,body:''});
 }
 if(p.startsWith('/api/')){assert.equal(r.method(),'GET');return route.fulfill({json:fixtures(u.href)});}
 const f=path.join(root,'src/main/resources/static',p);if(fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({body:fs.readFileSync(f),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
 return route.fulfill({contentType:'text/html',body:expandedJsp('allowance.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
 });
 await page.goto('http://asset.test/allowance');await page.waitForSelector('#allowance-list tbody tr');assert.equal(await page.locator('#allowance-list tbody tr').count(),15);
 await page.locator('#allowance-next').click();assert.equal(await page.locator('#allowance-list tbody tr').count(),2);
 await page.locator('#allowance-plus').click();assert.equal(await page.locator('[name=amount]').inputValue(),'800000');await page.locator('[name=memo]').fill('이번 달 용돈');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});
 assert.equal(writes[0].body.amount,'800000');assert.match(writes[0].body.requestId,/^[0-9a-f-]{36}$/);
 await page.locator('[data-allowance-edit="50"]').click();await page.locator('[name=amount]').fill('810000');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});assert.equal(writes[1].method,'PUT');
 await page.locator('#allowance-minus').click();await page.locator('[name=amount]').fill('20000');await page.locator('[name=ownerCode]').selectOption('WIFE');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});assert.equal(writes[2].body.amount,'-20000');
 await page.locator('[data-allowance-person]').first().click();await page.locator('[name=ownerCode]').selectOption('WIFE');await page.locator('#save-modal').click();await page.locator('#modal').waitFor({state:'hidden'});assert.match(writes[3].p,/source/);
 await page.locator('[data-allowance-remove="1"]').click();await page.locator('#question-dialog button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-allowance-remove="1"]'));assert.equal(writes[4].method,'DELETE');
 await page.locator('#allowance-search').fill('전표 16');assert.equal(await page.locator('#allowance-list tbody tr').count(),1);
 await page.locator('[data-owner="WIFE"]').click();await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');assert.match(requests.at(-1),/owner=WIFE/);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);console.log('PASS allowance manual +/-, edit, link reassignment/removal, paging, search, owner scope and mobile');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
