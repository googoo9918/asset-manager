/** Playwright 설치 및 Chromium 준비 후 실행. 실제 KIS/사용자 DB에 접근하지 않는 UI 회귀 검증. */
const {chromium}=require('playwright');
const {fixtures,expandedJsp,aa,root}=require('./page-modules.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  let sortingFixture=false;
  let kbSaved=null;
  const benefitReports=[];let benefitSync=null,benefitSynced=false;
  let kbPreviewRows=[],kbEntries=[],kbPointMode=false;
  let kbLegacyTemplate=false,kbMissingModule=false;
  const savedMappings=[];let mappingWrites=0;
  const kbCategories=[...fixtures('http://asset.test/api/categories'),
    {id:21,name:'식비',transactionType:'EXPENSE',active:true},
    {id:22,name:'외식',parentId:21,transactionType:'EXPENSE',active:true},
    {id:23,name:'카페·간식',parentId:21,transactionType:'EXPENSE',active:true},
    {id:24,name:'기타',transactionType:'EXPENSE',active:true},
    {id:25,name:'미분류',parentId:24,transactionType:'EXPENSE',active:true}];
  const kbCollection={range:'2026.09.01 ~ 2026.09.16',expected:3,complete:true,archive:'test.json',warnings:[],
    tables:[{name:'KB 전체 수집 이용내역',rows:[
      ['이용일시','이용카드명','이용하신곳','이용금액','결제방법','할인금액','적립예상포인트리','상태','승인번호'],
      ['2026.09.15\n10:00','카드 A','자동결제A','1000원','일시불','100원','10P','전표미매입','010'],
      ['2026.09.15\n11:00','카드 B','자동결제B','2000원','일시불','200원','20P','전표매입','011'],
      ['2026.09.15\n12:00','카드 A','포인트결제','500원','포인트리','0원','0P','전표매입','012']
    ]}],receipts:[{sourceKey:'2026.09.15\n10:00|카드 A|010|전표미매입',fields:{date:'2026-09-15',merchant:'자동결제A',industry:'한식',total:'1000원',tax:'91원',approvalNumber:'010'}}]};
  const sortingHoldings=[
    {symbol:'SORT_A',name:'정렬 A',quantity:'1',averagePrice:'100',currentPrice:'200',valueNative:'200',valueKrw:'200'},
    {symbol:'SORT_B',name:'정렬 B',quantity:'1',averagePrice:'450',currentPrice:'500',valueNative:'500',valueKrw:'500'},
    {symbol:'SORT_C',name:'정렬 C',quantity:'1',averagePrice:'100',currentPrice:'90',valueNative:'90',valueKrw:'90'}
  ].map(h=>({...h,accountId:3,currencyCode:'KRW',exchangeRate:'1'}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://asset.test/**',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/kb-card/benefits/plans'){
      const plan=route.request().postDataJSON();assert.equal(plan.tiers[0].minimumSpend,'400000');
      const saved={plan,revision:1};benefitReports.push(saved);return route.fulfill({json:saved});
    }
    if(u.pathname==='/api/kb-card/benefits/tracking')return route.fulfill({json:benefitReports.filter(c=>c.plan.effectiveMonth<=u.searchParams.get('month')).map(configuration=>({configuration,month:u.searchParams.get('month'),usage:benefitSynced?{currentSpend:'78900',previousSpend:'400000',complete:true,warnings:[]}:null,appliedTier:benefitSynced?configuration.plan.tiers[0]:null,earnedTier:null,nextTier:benefitSynced?configuration.plan.tiers[0]:null,remainingSpend:benefitSynced?'321100':null,benefits:benefitSynced?configuration.plan.tiers[0].benefits.map(benefit=>({benefit,used:'3000',remaining:'7000',progress:'30'})):[],updatedAt:benefitSynced?'2026-09-22T01:00:00Z':null}))});
    if(u.pathname==='/api/kb-card/benefits/tracking/sync'){benefitSync={...route.request().postDataJSON(),token:'tracking-test'};return route.fulfill({json:{state:'running'}});}
    if(u.pathname==='/api/kb-card/benefits/status')return route.fulfill({json:{state:'done',result:{tracking:benefitSync,warnings:[]}}});
    if(u.pathname==='/api/kb-card/benefits/tracking/apply'){assert.equal(route.request().postDataJSON().token,'tracking-test');benefitSynced=true;return route.fulfill({json:{}});}
    if(u.pathname==='/api/categories'){
      if(route.request().method()==='POST'){
        const body=route.request().postDataJSON(),saved={...body,id:26};kbCategories.push(saved);return route.fulfill({json:saved});
      }
      return route.fulfill({json:kbCategories});
    }
    if(u.pathname==='/api/kb-card/mappings'){
      if(route.request().method()==='PUT'){
        const saved=route.request().postDataJSON();assert.equal(saved.cardId,1);assert.equal(saved.accountId,1);
        assert.ok(!savedMappings.some(m=>m.sourceCard===saved.sourceCard));savedMappings.push(saved);mappingWrites++;
        return route.fulfill({json:saved});
      }
      return route.fulfill({json:kbPointMode?[{sourceCard:'K015',cardId:1,accountId:1,pointPayment:true}]:savedMappings});
    }
    if(kbPointMode&&u.pathname==='/api/cards')return route.fulfill({json:fixtures(u.href).map(c=>({...c,cardType:'DEBIT'}))});
    if(kbMissingModule&&u.pathname==='/js/common/kb-card-import.js')return route.fulfill({status:404,body:''});
    if(u.pathname==='/api/kb-card/connect')return route.fulfill({json:{code:'test-pairing',connected:true}});
    if(u.pathname==='/api/kb-card/collect')return route.fulfill({json:{state:'running'}});
    if(u.pathname==='/api/kb-card/collection')return route.fulfill({json:{state:'done',result:kbCollection}});
    if(u.pathname==='/api/kb-card/latest')return route.fulfill({json:kbPointMode?{...kbCollection,expected:1,tables:[{name:'KB 전체 수집 이용내역',rows:[kbCollection.tables[0].rows[0],kbCollection.tables[0].rows[3].map((v,i)=>i===1?'K015':v)]}]}:kbCollection});
    if(['/api/kb-card/browser','/api/kb-card/automation-browser'].includes(u.pathname)) return route.fulfill({json:{opened:true}});
    if(u.pathname==='/api/kb-card/capture') return route.fulfill({json:{source:'screen',tables:[{name:'이용내역',rows:[
      ['이용일','가맹점명','이용금액','상태','할부개월','승인번호'],
      ['2026.09.15','테스트 카페','1,000','승인','일시불','001'],
      ['2026.09.15','취소 카페','2,000','취소','일시불','002'],
      ['2026.09.15','할부 구매','30,000','승인','3개월','003'],
      ['합계','','33,000','','','']
    ]}]}});
    if(u.pathname==='/api/kb-card/preview') {
      const body=route.request().postDataJSON();
      kbPreviewRows=body.rows;
      assert.equal(body.cardId,'1');
      if(kbPointMode){
        assert.equal(body.sourceCard,'K015');assert.equal(body.rows.length,1);assert.equal(body.rows[0].pointPayment,true);assert.equal(body.rows[0].installmentMonths,1);
      }else if(body.rows[0].merchant.startsWith('자동결제')){
        assert.equal(body.rows.length,body.rows[0].merchant==='자동결제A'?2:1);assert.equal(body.rows[0].status,'APPROVED');
        assert.equal(body.rows[0].industry,body.rows[0].merchant==='자동결제A'?'한식':'');
        if(body.rows.length>1)assert.equal(body.rows[1].industry,'');
      }else{
        assert.equal(body.rows.length,3);assert.equal(body.rows[2].installmentMonths,3);assert.equal(body.rows[0].amount,'1000');
      }
      return route.fulfill({json:{previewId:'kb-test',rows:body.rows.map((row,index)=>({index,row,categoryId:index===0?22:25,categoryReason:index===0?'전표 업종: 한식':'판단 근거 부족 — 미분류',status:row.status==='APPROVED'&&(!row.pointPayment||kbPointMode)?'READY':'REVIEW',reason:row.pointPayment&&!kbPointMode?'포인트리 연결 필요':row.status==='APPROVED'?'저장 가능':'취소 내역 확인'}))}});
    }
    if(u.pathname==='/api/kb-card/commit') {
      kbSaved=route.request().postDataJSON();
      kbEntries.push(...kbSaved.indices.map(i=>({id:100+i,transactionDate:kbPreviewRows[i].date,transactionType:'EXPENSE',amount:kbPreviewRows[i].amount,cardId:1,categoryId:1,attribution:'HUSBAND',paymentMethod:'CREDIT',origin:'MANUAL',voided:false,memo:kbPreviewRows[i].merchant})));
      return route.fulfill({json:{imported:kbSaved.indices.length}});
    }
    if(u.pathname==='/api/transactions')return route.fulfill({json:[...fixtures(u.href),...kbEntries]});
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
    let html=expandedJsp(name+'.jsp').replace(/<%[\s\S]*?%>/g,'').replace(/<c:url value='([^']*)'\/>/g,'$1').replace(/<c:out[^>]*\/>/g,'테스트').replace('${pageContext.request.contextPath}','');
    if(name==='cards'&&kbLegacyTemplate)html=html.replace(/<button[^>]*id="kb-import"[^>]*>[\s\S]*?<\/button>/,'').replace(/<script src="\/js\/common\/kb-card-import.js"><\/script>/,'');
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
  await page.locator('#portfolio-chart [data-chart-tip]').first().evaluate(el=>el.focus({preventScroll:true}));await page.waitForSelector('#chart-tooltip',{state:'visible'});
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
  await page.goto('http://asset.test/cards');await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('#kb-benefit-new').click();
  await page.locator('#benefit-plan-save').click();
  assert.match(await page.locator('#benefit-plan-error').innerText(),/입력/);assert.equal(benefitReports.length,0);
  await page.selectOption('#benefit-plan-card','1');await page.locator('#benefit-plan-source').fill('KB Star B카드');
  await page.locator('[name=tier-min]').fill('400000');await page.locator('[data-plan-add]').click();
  await page.locator('[name=benefit-name]').fill('식당 할인');await page.locator('[name=benefit-limit]').fill('10000');await page.locator('[name=benefit-source]').fill('스타B_음식점할인');
  await page.locator('#benefit-plan-save').click();
  await page.waitForSelector('#modal:not([open])',{state:'attached'});
  assert.equal(benefitReports.length,1);assert.equal(kbSaved,null);
  assert.match(await page.locator('#kb-benefit-board').innerText(),/아직 동기화하지/);
  await page.locator('[data-benefit-sync]').click();await page.waitForFunction(()=>document.querySelector('#kb-benefit-status').textContent.includes('동기화 완료'));
  assert.equal(kbSaved,null);
  assert.match(await page.locator('#kb-benefit-board').innerText(),/321,100원/);
  assert.match(await page.locator('#kb-benefit-board').innerText(),/7,000원/);
  let manualBenefitTier=null;
  const tierSaveRoute=route=>{manualBenefitTier=route.request().postDataJSON().tierName;return route.fulfill({json:{}});};
  await page.route('**/api/kb-card/benefits/tracking/tier',tierSaveRoute);
  const belowTierRoute=route=>route.fulfill({json:[{
    configuration:{...benefitReports[0],plan:{...benefitReports[0].plan,tiers:[...benefitReports[0].plan.tiers,...benefitReports[0].plan.tiers]}},
    month:'2026-09',usage:{currentSpend:'78900',previousSpend:'0',complete:true,warnings:[],received:[
      {date:'26.09.10',name:'스타B_음식점할인',unit:'KRW',value:'3000'},
      {date:'26.09.11',name:'다른카드_음식점할인',unit:'KRW',value:'9999'},
      {date:'26.09.12',name:'스타B_음식점할인',unit:'POINT',value:'8888'}]},
    tierMode:manualBenefitTier?'MANUAL':'AUTO',selectedTierName:manualBenefitTier,tierRevision:1,
    appliedTier:manualBenefitTier?benefitReports[0].plan.tiers[0]:null,earnedTier:null,nextTier:benefitReports[0].plan.tiers[0],remainingSpend:'321100',benefits:manualBenefitTier?benefitReports[0].plan.tiers[0].benefits.map(benefit=>({benefit,used:'3000',remaining:'7000',progress:'30'})):[],updatedAt:'2026-09-22T01:00:00Z'
  }]});
  await page.route('**/api/kb-card/benefits/tracking?month=*',belowTierRoute);
  await page.reload();await page.waitForSelector('[data-benefit-edit]');
  const belowText=await page.locator('#kb-benefit-board').innerText();
  assert.match(belowText,/이번 달 받은 혜택 · 3,000원/);
  assert.match(belowText,/스타B_음식점할인/);assert.match(belowText,/확인 필요/);
  assert.doesNotMatch(belowText,/9,999|8,888|6,000|10,000|이 구간에 설정한 혜택이 없습니다/);
  assert.equal(await page.locator('#kb-benefit-board progress').count(),0);
  await page.locator('[data-benefit-tier]').selectOption('0');await page.locator('[data-benefit-tier-save]').click();
  await page.waitForFunction(()=>document.querySelector('#kb-benefit-board').textContent.includes('직접 지정 · 이번 달만 적용'));
  assert.match(await page.locator('#kb-benefit-board').innerText(),/7,000원/);
  assert.equal(await page.locator('#kb-benefit-board progress').getAttribute('value'),'30');
  await page.reload();await page.waitForSelector('[data-benefit-tier]');
  assert.match(await page.locator('#kb-benefit-board').innerText(),/직접 지정/);
  await page.locator('[data-benefit-tier]').selectOption('');await page.locator('[data-benefit-tier-save]').click();
  await page.waitForFunction(()=>!document.querySelector('#kb-benefit-board').textContent.includes('직접 지정 · 이번 달만 적용'));
  assert.equal(await page.locator('#kb-benefit-board progress').count(),0);
  await page.unroute('**/api/kb-card/benefits/tracking/tier',tierSaveRoute);
  await page.unroute('**/api/kb-card/benefits/tracking?month=*',belowTierRoute);
  await page.reload();await page.waitForSelector('[data-benefit-edit]');
  await page.locator('[data-benefit-edit]').click();
  assert.equal(await page.locator('[name=tier-min]').inputValue(),'400000');
  assert.equal(await page.locator('[name=benefit-source]').inputValue(),'스타B_음식점할인');
  await page.locator('#close-modal').click();
  await page.locator('#kb-import').click();
  await page.locator('#modal-body summary').filter({hasText:'연결 설정'}).click();
  await page.locator('#kb-connect').click();
  await page.waitForFunction(()=>document.querySelector('#kb-message').textContent==='Chrome 연결됨');
  assert.equal(await page.locator('#kb-connect').isEnabled(),true);
  assert.equal(kbSaved,null);
  await page.locator('#kb-existing').click();
  await page.locator('#modal-body summary').filter({hasText:'별도 로그인 창 사용'}).click();
  await page.locator('#kb-open').click();
  await page.locator('#kb-capture').click();await page.waitForSelector('#kb-card');
  await page.selectOption('#kb-card','1');await page.locator('#kb-check').click();
  await page.waitForSelector('#kb-save');
  assert.equal(mappingWrites,0); // No source card name in the manually captured table.
  assert.equal(await page.locator('[data-kb-row]').count(),2);
  assert.equal(await page.locator('[data-kb-row]:checked').count(),0);
  assert.match(await page.locator('#kb-preview').innerText(),/읽지 못한 행 1건/);
  assert.equal(await page.locator('[data-kb-category="0"]').inputValue(),'22');
  assert.equal(await page.locator('[data-kb-category="2"]').inputValue(),'25');
  assert.equal(kbSaved,null);
  await page.locator('#kb-save').click();assert.match(await page.locator('#kb-save-message').innerText(),/필수 확인란에 체크/);
  assert.equal(await page.locator('#kb-save-message').evaluate(el=>{
    const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.activeElement===el;
  }),true);
  assert.equal(await page.locator('#kb-save').isEnabled(),true);
  assert.equal(kbSaved,null);
  await page.locator('#kb-confirm-card').check();await page.locator('#kb-save').click();
  assert.match(await page.locator('#kb-save-message').innerText(),/저장할 내역을 선택/);
  await page.locator('#kb-confirm-card').check();await page.selectOption('#kb-category','1');
  await page.selectOption('[data-kb-category="2"]','23');
  await page.locator('[data-kb-remember="0"]').check();
  await page.locator('#kb-preview summary').filter({hasText:'카테고리 추가'}).click();
  await page.selectOption('#kb-new-parent','21');await page.locator('#kb-new-name').fill('사용자 분류');
  await page.locator('#kb-add-category').click();await page.waitForFunction(()=>document.querySelector('[data-kb-category="0"] option[value="26"]'));
  assert.equal(await page.locator('[data-kb-category="2"]').inputValue(),'23');
  await page.locator('#kb-select-all').check();
  assert.equal(await page.locator('[data-kb-row]:checked').count(),2);
  assert.match(await page.locator('#kb-selection-summary').innerText(),/2건 중 2건 선택/);
  await page.locator('#kb-save').click();
  await page.waitForSelector('#question-dialog[open]');
  assert.match(await page.locator('#question-message').innerText(),/2건.*31,000원/);
  assert.equal(kbSaved,null);await page.locator('#question-cancel').click();
  await page.waitForFunction(()=>document.querySelector('#kb-message').textContent.includes('등록을 취소'));
  assert.equal(kbSaved,null);
  await page.locator('#kb-save').click();await page.waitForSelector('#question-dialog[open]');
  await page.locator('#question-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#kb-message').textContent.includes('2건을 저장'));
  assert.deepEqual(kbSaved,{previewId:'kb-test',indices:[0,2],selections:[{index:0,categoryId:'1',remember:true},{index:2,categoryId:'23',remember:false}],confirmed:true,affectBalance:false});
  await page.locator('#kb-view-card').click();
  await page.locator('#modal-body h3').filter({hasText:/^카드 사용내역$/}).waitFor();
  assert.match(await page.locator('#modal-body').innerText(),/테스트 카페/);
  assert.match(await page.locator('#modal-body').innerText(),/할부 구매/);
  await page.locator('#close-modal').click();
  await page.goto('http://asset.test/transactions');await page.waitForSelector('#content[aria-busy="false"]');
  assert.match(await page.locator('#entries').innerText(),/테스트 카페/);
  await page.goto('http://asset.test/cards');await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('#kb-import').click();await page.locator('#kb-collect').click();
  await page.waitForFunction(()=>document.querySelector('#kb-message').textContent.includes('이용내역 3건'));
  assert.match(await page.locator('#kb-evidence').innerText(),/카드별 수집 요약/);
  assert.match(await page.locator('#kb-evidence').innerText(),/매출전표 1건/);
  assert.equal(await page.locator('#kb-source-card option').count(),2);
  await page.selectOption('#kb-card','1');await page.locator('#kb-check').click();
  await page.waitForSelector('#kb-save');
  assert.equal(mappingWrites,1);assert.equal(savedMappings[0].sourceCard,'카드 A');
  assert.equal(await page.locator('#kb-card').isDisabled(),true);
  assert.match(await page.locator('#kb-preview').innerText(),/자동결제A/);
  assert.doesNotMatch(await page.locator('#kb-preview').innerText(),/자동결제B/);
  assert.match(await page.locator('#kb-preview').textContent(),/포인트리 연결 필요/);
  assert.equal(await page.locator('[data-kb-row]').count(),1);
  await page.selectOption('#kb-source-card','1');assert.equal(await page.locator('#kb-save').count(),0);
  assert.equal(await page.locator('#kb-card').inputValue(),''); // Never reuse another source card's selection.
  await page.selectOption('#kb-card','1');
  await page.locator('#kb-check').click();await page.waitForSelector('#kb-save');
  assert.match(await page.locator('#kb-preview').innerText(),/자동결제B/);
  assert.doesNotMatch(await page.locator('#kb-preview').innerText(),/자동결제A/);
  await page.locator('#close-modal').click();
  await page.locator('#kb-import').click();await page.locator('#kb-latest').click();
  await page.waitForSelector('#kb-source-card');assert.match(await page.locator('#kb-evidence').innerText(),/카드별 수집 요약/);
  assert.equal(await page.locator('#kb-card').inputValue(),'1');
  assert.equal(await page.locator('#kb-card').isDisabled(),true);
  assert.equal(mappingWrites,2);
  await page.locator('#kb-check').click();await page.waitForSelector('#kb-save');
  assert.equal(mappingWrites,2);
  await page.locator('#close-modal').click();
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('#kb-import').click();await page.locator('#kb-latest').click();await page.waitForSelector('#kb-source-card');
  await page.selectOption('#kb-source-card','1');
  assert.equal(await page.locator('#kb-card').inputValue(),'1');assert.equal(await page.locator('#kb-card').isDisabled(),true);
  assert.match(await page.locator('#kb-saved-mapping').innerText(),/카드 B.*테스트 카드.*생활비/);
  await page.locator('#close-modal').click();
  kbPointMode=true;
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('#kb-import').click();await page.locator('#kb-latest').click();
  await page.waitForSelector('#kb-source-card');
  assert.equal(await page.locator('#kb-card').inputValue(),'1');
  assert.equal(await page.locator('#kb-card').isDisabled(),true);
  await page.locator('#kb-check').click();await page.waitForSelector('#kb-save');
  assert.equal(await page.locator('[data-kb-row]').count(),1);
  assert.equal(await page.locator('#kb-balance').inputValue(),'true');
  assert.equal(await page.locator('#kb-balance').isDisabled(),true);
  assert.match(await page.locator('#kb-preview').innerText(),/포인트리 사용액은 생활비에서 차감/);
  await page.locator('#kb-select-all').check();await page.locator('#kb-confirm-card').check();await page.selectOption('#kb-category','1');
  await page.locator('#kb-save').click();await page.waitForSelector('#question-dialog[open]');
  assert.match(await page.locator('#question-message').innerText(),/생활비에서 500원 차감/);
  await page.locator('#question-form button[type="submit"]').click();await page.waitForSelector('#kb-view-card');
  assert.equal(kbSaved.affectBalance,true);
  await page.locator('#close-modal').click();kbPointMode=false;
  kbLegacyTemplate=true;
  await page.goto('http://asset.test/cards');await page.waitForSelector('#content[aria-busy="false"]');
  assert.equal(await page.locator('#notice.error').count(),0);
  assert.ok(await page.locator('#list tbody tr').count()>0);
  assert.notEqual(await page.locator('#card-chart-month').inputValue(),'');
  kbLegacyTemplate=false;kbMissingModule=true;
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  assert.equal(await page.locator('#notice.error').count(),0);
  assert.ok(await page.locator('#list tbody tr').count()>0);
  await page.locator('#kb-import').click();assert.match(await page.locator('#notice').innerText(),/파일이 로드되지/);
  kbMissingModule=false;
  await page.reload();await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('#kb-import').click();await page.waitForSelector('#kb-collect');
  await page.locator('#close-modal').click();
  // Account-level card payments: one input for multiple cards, then one completed calendar item.
  const due=new Date().toISOString().slice(0,10);
  const members=[1,2].map(id=>({id,cardId:id,accountId:1,sourceKey:'CARD:'+id,dueDate:due,title:'카드 결제',planType:'CARD_PAYMENT',attribution:id===1?'HUSBAND':'WIFE',amount:'100000',state:'PENDING'}));
  let accountPayment=null;
  await page.route('http://asset.test/api/cards',r=>r.fulfill({json:[...fixtures('http://asset.test/api/cards'),{...fixtures('http://asset.test/api/cards')[0],id:2,cardName:'두 번째 카드',ownerCode:'WIFE'}]}));
  await page.route('http://asset.test/api/occurrences**',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/occurrences/card-account/confirm'){
      const body=route.request().postDataJSON();assert.deepEqual(body.occurrenceIds,[1,2]);assert.equal(body.accountId,1);assert.equal(body.amount,'250000');
      accountPayment={...members[0],id:10,cardId:null,sourceKey:'CARD_ACCOUNT:test',title:'생활비 카드대금',state:'COMPLETED',actualDate:body.date,actualAmount:body.amount};
      members.forEach(o=>{o.state='COMPLETED';o.paymentGroupId=10;});return route.fulfill({json:accountPayment});
    }
    if(u.pathname.endsWith('/card-account-group'))return route.fulfill({json:members});
    if(u.pathname==='/api/occurrences')return route.fulfill({json:accountPayment?[...members,accountPayment]:members});
    return route.fulfill({json:u.pathname.endsWith('/10')?accountPayment:members[0]});
  });
  await page.goto('http://asset.test/planned');await page.waitForSelector('#content[aria-busy="false"]');
  await page.locator('[data-owner=JOINT]').click();await page.waitForSelector('#content[aria-busy="false"]');
  assert.equal(await page.locator('#calendar [data-action=occurrence-confirm]').count(),1);
  assert.match(await page.locator('#calendar').innerText(),/생활비 카드대금/);
  await page.locator('#calendar [data-action=occurrence-confirm]').click();await page.waitForSelector('#modal[open]');
  assert.match(await page.locator('#modal-body').innerText(),/두 번째 카드/);
  assert.equal(await page.locator('[name=amount]').inputValue(),'');
  await page.locator('[name=amount]').fill('250000');await page.locator('#save-modal').click();await page.waitForSelector('#modal',{state:'hidden'});
  await page.waitForSelector('#calendar .done');assert.equal(await page.locator('#calendar [data-action=occurrence-confirm]').count(),1);
  await page.locator('#calendar .done').click();await page.waitForSelector('#modal[open]');
  assert.match(await page.locator('#modal-body').innerText(),/250,000원/);assert.match(await page.locator('#modal-body').innerText(),/두 번째 카드/);
  await page.locator('#close-modal').click();
  fs.mkdirSync(path.join(root,'build'),{recursive:true});
  await page.screenshot({path:path.join(root,'build/ui-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS browser routes, buttons, dual amounts, tooltip, order persistence, detail, confirm popup, portfolio/detail sorting and sort persistence');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
