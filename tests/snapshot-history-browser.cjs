const {chromium}=require('../tools/kb-card/node_modules/playwright');const {fixtures,expandedJsp,root}=require('./page-modules.cjs');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[];let rows=Array.from({length:17},(_,i)=>({id:i+1,captured_at:i===0?'2026-09-30T14:59:59Z':i===1?'2026-09-30T15:00:00Z':'2026-10-02T01:'+String(i).padStart(2,'0')+':00Z',total_assets:String(1000+i),total_debts:'0',net_assets:String(1000+i),sync_status:'성공'}));rows[15].captured_at=rows[16].captured_at;
 page.on('pageerror',e=>errors.push(e.message));await page.route('http://asset.test/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;
 if(p==='/api/snapshots')return route.fulfill({json:rows});
 if(p==='/api/refresh'){const row={...rows.at(-1),id:rows.length+1};rows.push(row);return route.fulfill({json:{id:row.id,syncStatus:'성공'}});}
 if(/^\/api\/snapshots\/\d+$/.test(p))return route.fulfill({json:fixtures('/api/snapshots/1')});
 if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
 const file=path.join(root,'src/main/resources/static',p);if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
 return route.fulfill({contentType:'text/html',body:expandedJsp('snapshots.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});});
 await page.goto('http://asset.test/snapshots');await page.waitForSelector('#snapshot-list tbody tr');assert.equal(await page.locator('#snapshot-list tbody tr').count(),15);assert.match(await page.locator('#snapshot-list tbody tr').first().innerText(),/#17/);
 await page.locator('#snapshot-next').click();assert.equal(await page.locator('#snapshot-list tbody tr').count(),2);
 await page.locator('#snapshot-mode').selectOption('daily');assert.equal(await page.locator('#snapshot-list tbody tr').count(),3);assert.match(await page.locator('#snapshot-list tbody tr').first().innerText(),/15회/);
 await page.locator('[data-snapshot-day="2026-10-01"]').click();assert.equal(await page.locator('#snapshot-list tbody tr').count(),1);assert.match(await page.locator('#snapshot-list tbody tr').innerText(),/#2/);
 await page.locator('#snapshot-clear').click();assert.equal(await page.locator('#snapshot-list tbody tr').count(),15);
 await page.locator('#snapshot-day').fill('2026-10-10');await page.locator('#snapshot-day').dispatchEvent('change');assert.equal(await page.locator('#snapshot-list tbody tr').count(),0);assert.match(await page.locator('#snapshot-list').innerText(),/스냅샷이 없습니다/);
 await page.locator('#snapshot-clear').click();await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#snapshot-status').textContent.includes('18회 저장'));assert.match(await page.locator('#snapshot-list tbody tr').first().innerText(),/#18/);
 assert.equal(await page.locator('#snap-before').inputValue(),'17');assert.equal(await page.locator('#snap-after').inputValue(),'18');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}assert.deepEqual(errors,[]);console.log('PASS snapshots individual captures, daily latest, KST midnight, equal timestamps, paging, empty day and capture refresh');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
