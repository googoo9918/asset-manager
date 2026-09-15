/** Playwright 설치 및 Chromium 준비 후 실행. 실제 KIS/사용자 DB에 접근하지 않는 UI 회귀 검증. */
const {chromium}=require('playwright');
const {fixtures,expandedJsp,aa,root}=require('./page-modules.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  let sortingFixture=false;
  const sortingHoldings=[
    {symbol:'SORT_A',name:'정렬 A',quantity:'1',averagePrice:'100',currentPrice:'200',valueNative:'200',valueKrw:'200'},
    {symbol:'SORT_B',name:'정렬 B',quantity:'1',averagePrice:'450',currentPrice:'500',valueNative:'500',valueKrw:'500'},
    {symbol:'SORT_C',name:'정렬 C',quantity:'1',averagePrice:'100',currentPrice:'90',valueNative:'90',valueKrw:'90'}
  ].map(h=>({...h,accountId:3,currencyCode:'KRW',exchangeRate:'1'}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
    const u=new URL(route.request().url());
    if(sortingFixture&&u.pathname==='/api/securities/holdings') return route.fulfill({json:sortingHoldings});
    if(sortingFixture&&u.pathname==='/api/securities/portfolio') return route.fulfill({json:[
      ...sortingHoldings.map(h=>({...h,currency:'KRW',costNative:h.averagePrice})),
      {symbol:'CASH',name:'예수금',currency:'KRW',valueNative:'1000',valueKrw:'1000',costNative:'1000',quantity:'0'}
    ]});
    if(u.pathname.startsWith('/api/display-order/')){
      const {ids}=route.request().postDataJSON();
      aa.sort((a,b)=>{const x=ids.indexOf(a.id),y=ids.indexOf(b.id);return (x<0?999:x)-(y<0?999:y)});
      return route.fulfill({status:204});
    }
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
    const file=path.join(root,'src/main/resources/static',u.pathname);
    if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'image/svg+xml'});
    const name=u.pathname==='/'?'dashboard':u.pathname.slice(1);
    const html=expandedJsp(name+'.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','');
    return route.fulfill({contentType:'text/html',body:html});
  });
  for(const name of ['dashboard','assets','cash','savings','cards','loans','transactions','planned','snapshots','settings','securities']){
    await page.goto('http://asset.test/'+(name==='dashboard'?'':name));
    await page.waitForSelector('#content[aria-busy="false"]');
    assert.equal(await page.locator('#notice.error').count(),0,name);
  }
  await page.locator('[data-owner=WIFE]').click();await page.waitForSelector('#content[aria-busy="false"]');
  assert.equal(await page.locator('[data-owner=WIFE]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-owner=JOINT]').click();await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('[data-layout=pie]').click();assert.equal(await page.locator('#portfolio-chart svg').count(),1);
  await page.locator('#portfolio-chart [data-chart-tip]').first().focus();assert.equal(await page.locator('#chart-tooltip').isVisible(),true);
  await page.locator('#reorder').click();await page.waitForSelector('#order-list li');
  const original=await page.locator('#order-list li').first().getAttribute('data-order-id');
  await page.locator('#order-list .drag-handle').first().focus();await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.locator('#order-list li').first().getAttribute('data-order-id'),original);
  await page.locator('#save-modal').click();await page.waitForSelector('#modal',{state:'hidden'});
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  assert.match(await page.locator('#security-list tbody tr').first().innerText(),/윱니 계좌/);
  await page.locator('[data-action=security-detail]').first().click();await page.waitForSelector('#security-tab-body');
  assert.match(await page.locator('#security-tab-body').innerText(),/25.0%/);assert.match(await page.locator('#security-tab-body').innerText(),/USD \$40.00/);
  await page.locator('#close-modal').click();
  await page.locator('[data-action=account-close]').first().click();await page.waitForSelector('#question-dialog[open]');
  await page.locator('#question-cancel').click();
  sortingFixture=true;
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  const symbols=container=>page.locator(container+' tbody tr td:first-child').allTextContents().then(cells=>cells.map(c=>c.split(' / ')[1]));
  for(const [metric,desc,asc] of [
    ['value',['CASH','SORT_B','SORT_A','SORT_C'],['SORT_C','SORT_A','SORT_B','CASH']],
    ['profit',['SORT_A','SORT_B','SORT_C','CASH'],['SORT_C','SORT_B','SORT_A','CASH']],
    ['return',['SORT_A','SORT_B','SORT_C','CASH'],['SORT_C','SORT_B','SORT_A','CASH']]
  ]) {
    await page.selectOption('#portfolio-sort-metric',metric);
    await page.selectOption('#portfolio-sort','desc');
    assert.deepEqual(await symbols('#portfolio-table'),desc);
    await page.locator(`#portfolio-table [data-holding-sort=${metric}]`).click();
    assert.deepEqual(await symbols('#portfolio-table'),asc);
    assert.equal(await page.locator('#portfolio-sort').inputValue(),'asc');
    await page.locator(`#portfolio-table [data-holding-sort=${metric}]`).click();
    assert.deepEqual(await symbols('#portfolio-table'),desc);
  }
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  assert.equal(await page.locator('#portfolio-sort-metric').inputValue(),'return');
  assert.deepEqual(await symbols('#portfolio-table'),['SORT_A','SORT_B','SORT_C','CASH']);
  await page.locator('[data-action=security-detail]').first().click();
  await page.waitForSelector('#security-tab-body [data-holding-sort]');
  assert.deepEqual(await symbols('#security-tab-body'),['SORT_B','SORT_A','SORT_C']);
  for(const [metric,desc,asc] of [
    ['value',['SORT_B','SORT_A','SORT_C'],['SORT_C','SORT_A','SORT_B']],
    ['profit',['SORT_A','SORT_B','SORT_C'],['SORT_C','SORT_B','SORT_A']],
    ['return',['SORT_A','SORT_B','SORT_C'],['SORT_C','SORT_B','SORT_A']]
  ]) {
    if(metric!=='value') await page.locator(`#security-tab-body [data-holding-sort=${metric}]`).click();
    assert.deepEqual(await symbols('#security-tab-body'),desc);
    await page.locator(`#security-tab-body [data-holding-sort=${metric}]`).click();
    assert.deepEqual(await symbols('#security-tab-body'),asc);
  }
  await page.locator('#security-tabs button').filter({hasText:'거래내역'}).click();
  await page.locator('#security-tabs button').filter({hasText:'보유종목'}).click();
  assert.deepEqual(await symbols('#security-tab-body'),['SORT_C','SORT_B','SORT_A']);
  await page.locator('#close-modal').click();
  fs.mkdirSync(path.join(root,'build'),{recursive:true});
  await page.screenshot({path:path.join(root,'build/ui-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS browser routes, buttons, dual amounts, tooltip, order persistence, detail, confirm popup, portfolio/detail sorting and sort persistence');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
