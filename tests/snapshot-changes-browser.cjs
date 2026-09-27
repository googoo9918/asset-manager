/** Isolated browser regression: fixture snapshots, no server or personal database. */
const {chromium}=require('../tools/kb-card/node_modules/playwright');
const {fixtures,expandedJsp,root}=require('./page-modules.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const date=offset=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d);};
const account=(id,amount,type='CASH',owner='HUSBAND')=>({entity_id:id,item_type:'ACCOUNT',asset_type:type,owner_code:owner,amount_krw:amount,details:JSON.stringify({accountName:id===2?'투자 계좌':'생활비 계좌'})});
const loan=amount=>({...account(1,amount),item_type:'LOAN',details:'{"loanName":"주택 대출"}'});
const position=amount=>({...account(20,amount,'SECURITIES'),item_type:'POSITION',details:JSON.stringify({accountId:2,symbol:'TEST',name:'테스트 종목',currencyCode:'USD',quantity:'10',currentPrice:'100',exchangeRate:'1300'})});
const data={
  1:[account(1,'1000000'),account(2,'2000000','SECURITIES'),loan('500000'),position('1900000'),account(3,'100000','CASH','WIFE')],
  2:[account(1,'99999999')],
  3:[account(1,'1500000'),account(2,'2300000','SECURITIES'),loan('300000'),position('2100000'),account(3,'100000','CASH','WIFE')]
};
const snapshots=[{id:1,captured_at:date(-2)+'T23:00:00+09:00'},{id:2,captured_at:date(0)+'T06:00:00+09:00'},{id:3,captured_at:date(0)+'T07:00:00+09:00'}];
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://asset.test/**',async route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/api/snapshots'){
        const owner=u.searchParams.get('owner');
        return route.fulfill({json:snapshots.map(s=>{
          const selected=data[s.id].filter(i=>owner==='JOINT'||i.owner_code===owner);
          const total=type=>selected.filter(i=>i.item_type===type).reduce((n,i)=>n+Number(i.amount_krw),0);
          return {...s,total_assets:String(total('ACCOUNT')),total_debts:String(total('LOAN')),net_assets:String(total('ACCOUNT')-total('LOAN')),sync_status:'성공'};
        })});
      }
      if(/^\/api\/snapshots\/\d+$/.test(u.pathname))return route.fulfill({json:data[u.pathname.split('/').at(-1)]});
      if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixtures(u.href)});
      const file=path.join(root,'src/main/resources/static',u.pathname);
      if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'image/svg+xml'});
      const html=expandedJsp((u.pathname==='/'?'dashboard':u.pathname.slice(1))+'.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','');
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.goto('http://asset.test/');await page.waitForSelector('#content[aria-busy="false"]');
    assert.equal(await page.locator('[data-trend-change]').count(),1);
    assert.match(await page.locator('[data-trend-change]').innerText(),/\+1,000,000원/);
    await page.locator('[data-trend-change]').click();await page.waitForSelector('#modal[open]');
    assert.match(await page.locator('#modal-body').innerText(),/항목별 반영액 합계: \+1,000,000원/);
    assert.match(await page.locator('#modal-body').innerText(),/주택 대출/);
    await page.locator('#modal-body summary').click();
    assert.match(await page.locator('#modal-body').innerText(),/테스트 종목/);
    assert.match(await page.locator('#modal-body').innerText(),/예수금·기타 잔액/);
    await page.locator('#close-modal').click();
    await page.selectOption('#trend-period','custom');
    await page.fill('#trend-from',date(0));await page.locator('#trend-go').click();
    await page.waitForFunction(()=>document.querySelectorAll('#trend tbody tr').length===1);
    assert.match(await page.locator('#trend').innerText(),new RegExp(date(-2)));
    assert.match(await page.locator('[data-trend-change]').innerText(),/\+1,000,000원/);
    await page.selectOption('#trend-metric','total_debts');
    await page.waitForFunction(()=>document.querySelector('[data-trend-change]')?.textContent.includes('-200,000원'));
    await page.locator('[data-trend-change]').focus();await page.keyboard.press('Enter');await page.waitForSelector('#modal[open]');
    assert.match(await page.locator('#modal-body').innerText(),/항목별 반영액 합계: -200,000원/);
    await page.locator('#close-modal').click();
    await page.locator('[data-owner=WIFE]').click();await page.waitForSelector('#content[aria-busy="false"]');
    await page.locator('[data-trend-change]').click();await page.waitForSelector('#modal[open]');
    assert.match(await page.locator('#modal-body').innerText(),/이 기간에 금액 변동이 없습니다/);
    assert.doesNotMatch(await page.locator('#modal-body').innerText(),/주택 대출|투자 계좌/);
    await page.locator('#close-modal').click();
    await page.locator('[data-owner=JOINT]').click();await page.waitForSelector('#content[aria-busy="false"]');
    await page.selectOption('#trend-metric','SECURITIES');
    await page.waitForFunction(()=>document.querySelector('[data-trend-change]')?.textContent.includes('+300,000원'));
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-trend-change]').click();await page.waitForSelector('#modal[open]');
    assert.match(await page.locator('#modal-body').innerText(),/항목별 반영액 합계: \+300,000원/);
    await page.locator('#modal-body summary').click();
    fs.mkdirSync(path.join(root,'build'),{recursive:true});
    await page.screenshot({path:path.join(root,'build/snapshot-changes-mobile.png'),fullPage:true});
    await page.goto('http://asset.test/snapshots');await page.waitForSelector('#content[aria-busy="false"]');
    await page.selectOption('#snap-before','1');await page.selectOption('#snap-after','3');await page.locator('#compare').click();
    await page.waitForFunction(()=>document.querySelector('#comparison')?.textContent.includes('항목별 반영액 합계: +1,000,000원'));
    assert.deepEqual(errors,[]);
    console.log('PASS trend details, last daily snapshot, missing day, out-of-range baseline, metrics, owners, keyboard, mobile, explicit comparison');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
