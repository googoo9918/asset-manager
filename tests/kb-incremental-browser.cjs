// Synthetic data only. Does not access KB, a live bridge, or the application database.
const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage(),errors=[],requests=[],commits=[],links=[];
  let running=false,polls=0;
  const headers=['이용일시','이용카드명','이용하신곳','이용금액','결제방법','할인금액','적립예상포인트리','상태','승인번호'];
  const data=Array.from({length:300},(_,i)=>['2026.09.15\n10:00','카드 A','가맹점 '+i,'1000원','일시불','0원','0P','전표매입',String(i)]);
  const result={format:'asset-manager-kb-collection',range:'2026.09.01 ~ 2026.09.30',expected:300,complete:true,warnings:[],stats:{fetched:1,reused:299,failed:0},tables:[{name:'KB 이용내역',rows:[headers,...data]}],receipts:data.map((row,i)=>({sourceKey:[row[0],row[1],row[8],row[7]].join('|'),approvalNumber:String(i),reused:i!==0,fields:{date:'2026-09-15',merchant:'가맹점 '+i,approvalNumber:String(i),total:'1000원'}}))};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
    const request=route.request(),u=new URL(request.url()),p=u.pathname;
    if(p==='/api/kb-card/commit'){commits.push(request.postDataJSON());return route.fulfill({json:{imported:commits.at(-1).indices.length}});}
    if(p.startsWith('/api/allowance/source/')){links.push(request.postDataJSON());return route.fulfill({status:200,body:''});}
    if(p==='/api/kb-card/connect')return route.fulfill({json:{connected:true,code:'test'}});
    if(p==='/api/kb-card/collect'){requests.push(request.postDataJSON());running=true;polls=0;return route.fulfill({json:{state:'running'}});}
    if(p==='/api/kb-card/collection'){
      if(running&&polls++<1)return route.fulfill({json:{state:'running',progress:{collected:200,expected:300,reused:199,fetched:1,failed:0,page:14}}});
      const wasRunning=running;running=false;return route.fulfill({json:wasRunning?{state:'done',result}:{state:'idle'}});
    }
    if(p==='/api/kb-card/latest')return route.fulfill({json:result});
    if(p==='/api/kb-card/mappings')return route.fulfill({json:request.method()==='PUT'?request.postDataJSON():[]});
    if(p==='/api/kb-card/preview')return route.fulfill({json:{previewId:'test',rows:data.map((r,index)=>({index,sourceEntryId:index===299?999:null,allowanceOwner:index===299?'WIFE':null,status:index===299?'DUPLICATE':'READY',reason:index===299?'이미 등록된 내역':'등록 가능',row:{date:'2026-09-15',merchant:r[2],amount:'1000',installmentMonths:1},categoryId:null}))}});
    if(p.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
    const file=path.join(root,'src/main/resources/static',p);
    if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml'});
    return route.fulfill({contentType:'text/html',body:expandedJsp('cards.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','')});
  });
  await page.goto('http://asset.test/cards');await page.locator('#kb-import').click();
  await page.waitForFunction(()=>document.querySelector('#kb-flow-next')?.disabled===false);
  assert.equal(await page.locator('#kb-stage-collect').isVisible(),true);
  assert.equal(await page.locator('#kb-stage-map').isVisible(),false);
  await page.locator('#kb-latest').click();await page.locator('#kb-source-card').waitFor();
  assert.equal(await page.locator('#kb-receipt-mode').inputValue(),'incremental');
  await page.locator('#kb-receipt-view summary').first().click();
  assert.equal(await page.locator('[data-kb-receipt]').count(),15);assert.equal(await page.locator('#kb-receipt-list .detail-grid').count(),0);
  await page.locator('[data-kb-receipt] summary').first().click();await page.locator('#kb-receipt-list .detail-grid').waitFor();
  await page.locator('#kb-receipt-next').click();assert.match(await page.locator('#kb-receipt-page').innerText(),/2 \/ 20/);
  await page.locator('#kb-receipt-search').fill('가맹점 299');assert.equal(await page.locator('[data-kb-receipt]').count(),1);
  await page.locator('#kb-flow-back').click();
  await page.locator('#kb-flow-next').click();await page.waitForFunction(()=>document.querySelector('#kb-progress').value===200);
  assert.equal(await page.locator('#kb-flow-next').isDisabled(),true);
  await page.waitForFunction(()=>document.querySelector('#kb-flow-next').disabled===false);
  assert.deepEqual(requests,[{receiptMode:'incremental'}]);assert.match(await page.locator('#kb-collection-counts').innerText(),/299/);
  assert.equal(await page.locator('#kb-stage-map').isVisible(),true);assert.equal(await page.locator('#kb-stage-collect').isVisible(),false);
  fs.mkdirSync(path.join(root,'build/ui-review'),{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:path.join(root,'build/ui-review/kb-import-card.png')});
  await page.locator('#kb-card').selectOption('1');await page.locator('#kb-flow-next').click();await page.locator('#kb-preview-rows').waitFor();
  assert.equal(await page.locator('#kb-stage-map').isVisible(),false);assert.equal(await page.locator('#kb-stage-save').isVisible(),true);
  assert.equal(await page.locator('#kb-preview-rows tbody tr:visible').count(),15);
  await page.locator('[data-kb-row="0"]').check();await page.locator('#kb-preview-next').click();
  assert.equal(await page.locator('#kb-preview-rows tbody tr:visible').count(),15);await page.locator('[data-kb-row="15"]').check();
  await page.locator('#kb-preview-prev').click();assert.equal(await page.locator('[data-kb-row="0"]').isChecked(),true);
  assert.match(await page.locator('#kb-selection-summary').innerText(),/2건 선택/);
  assert.equal(await page.locator('[data-kb-allowance="0"]').inputValue(),'');
  await page.locator('#kb-allowance-bulk').selectOption('HUSBAND');await page.locator('#kb-allowance-apply').click();
  assert.equal(await page.locator('[data-kb-allowance="15"]').inputValue(),'HUSBAND');
  assert.equal(await page.locator('[data-kb-allowance="1"]').inputValue(),'');
  await page.locator('[data-kb-allowance="0"]').selectOption('WIFE');
  await page.locator('#kb-review-filter').selectOption('other');
  assert.equal(await page.locator('#kb-preview-rows tbody tr:visible').count(),1);
  assert.match(await page.locator('#kb-preview-rows tbody tr:visible').innerText(),/이미 등록된 내역/);
  assert.equal(await page.locator('[data-kb-row]:checked').count(),2);
  assert.equal(await page.locator('[data-kb-assigned="999"]').innerText(),'윱니');
  await page.locator('[data-kb-existing="999"]').selectOption('HUSBAND');await page.locator('[data-kb-assign="999"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-kb-assigned="999"]').textContent==='동구');assert.deepEqual(links,[{ownerCode:'HUSBAND'}]);
  await page.locator('#kb-review-filter').selectOption('READY');
  await page.locator('#kb-select-all').check();assert.equal(await page.locator('[data-kb-row]:checked').count(),299);
  await page.screenshot({path:path.join(root,'build/ui-review/kb-import-review.png')});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    const next=await page.locator('#kb-flow-next').boundingBox();assert.ok(next.y>=0&&next.y+next.height<=844);
    await page.screenshot({path:path.join(root,`build/ui-review/kb-import-review-${width}.png`)});
  }
  fs.mkdirSync(path.join(root,'build/ui-review'),{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#kb-select-all').uncheck();await page.locator('[data-kb-row="0"]').check();
  await page.locator('#kb-category').selectOption('1');await page.locator('#kb-confirm-card').check();await page.locator('#kb-flow-next').click();
  await page.locator('#question-dialog').waitFor();assert.match(await page.locator('#question-dialog').innerText(),/용돈 사용액/);
  await page.locator('#question-dialog button[type=submit]').click();await page.locator('#kb-view-card').waitFor();
  assert.equal(commits.length,1);assert.equal(commits[0].selections[0].allowanceOwner,'WIFE');
  await page.locator('#close-modal').click();await page.locator('#kb-import').click();await page.waitForFunction(()=>document.querySelector('#kb-flow-next')?.disabled===false);
  await page.screenshot({path:path.join(root,'build/ui-review/kb-import-mobile.png')});
  assert.deepEqual(errors,[]);console.log('PASS KB incremental mode, 300 receipts with lazy details/search/paging, progress, preview paging and selection persistence, mobile layouts');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
