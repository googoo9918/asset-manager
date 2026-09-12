/** Playwright 설치 및 Chromium 준비 후 실행. 실제 KIS/사용자 DB에 접근하지 않는 UI 회귀 검증. */
const {chromium}=require('playwright');
const {fixtures,expandedJsp,aa,root}=require('./page-modules.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
    const u=new URL(route.request().url());
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
  await page.locator('#save-modal').click();await page.waitForSelector('#modal:not([open])');
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  assert.match(await page.locator('#security-list tbody tr').first().innerText(),/윱니 계좌/);
  await page.locator('[data-action=security-detail]').first().click();await page.waitForSelector('#security-tab-body');
  assert.match(await page.locator('#security-tab-body').innerText(),/25.0%/);assert.match(await page.locator('#security-tab-body').innerText(),/USD \$40.00/);
  await page.locator('#close-modal').click();
  await page.locator('[data-action=account-close]').first().click();await page.waitForSelector('#question-dialog[open]');
  await page.locator('#question-cancel').click();
  await page.screenshot({path:path.join(root,'tests/ui-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS browser routes, buttons, dual amounts, tooltip, order persistence, detail, confirm popup');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
