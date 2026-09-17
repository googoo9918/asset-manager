const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {chromium}=require('playwright');
const {parseFile,kbUrl,readTables,createBridge}=require('./bridge.cjs');
test('CSV preserves quoted merchant names, decimal strings and blank fields',async()=>{
  const result=await parseFile('내역.csv',Buffer.from('\ufeff이용일,가맹점,금액\r\n2026-09-15,"카페, 서울",1234.50\r\n'));
  assert.deepEqual(result[0].rows[1],['2026-09-15','카페, 서울','1234.50']);
});
test('XLSX preserves dates and cells and does not execute formulas',async()=>{
  const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('이용내역');
  sheet.addRow(['이용일','가맹점','금액']);sheet.addRow([new Date('2026-09-15T00:00:00Z'),'카페',1234.5]);
  const result=await parseFile('내역.xlsx',Buffer.from(await wb.xlsx.writeBuffer()));
  assert.deepEqual(result[0].rows[1],['2026-09-15','카페','1234.5']);
});
test('rejects unsupported, oversized and excessive-row files',async()=>{
  await assert.rejects(parseFile('내역.xls',Buffer.from('xls')),/XLSX/);
  await assert.rejects(parseFile('내역.csv',Buffer.alloc(5*1024*1024+1)),/5MB/);
  await assert.rejects(parseFile('내역.csv',Buffer.from('a,b\n'.repeat(2001))),/2,000/);
});
test('restricts capture to HTTPS KB hosts',()=>{
  assert.equal(kbUrl('https://card.kbcard.com/foo'),true);
  for(const url of ['https://kbcard.com.evil.test/','http://card.kbcard.com/','file:///test','https://evil.test/?card.kbcard.com']) assert.equal(kbUrl(url),false);
});
test('extension export is validated before import',async()=>{
  const data={format:'asset-manager-kb-tables',version:1,tables:[{name:'이용내역',rows:[['날짜','금액'],['2026-09-15','1000']]}]};
  assert.deepEqual(await parseFile('내역.kbcard.json',Buffer.from(JSON.stringify(data))),data.tables);
  await assert.rejects(parseFile('내역.kbcard.json',Buffer.from(JSON.stringify({...data,version:2}))),/파일/);
});
test('connected Chrome commands read only tables and restrict login or payment actions',async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  try{
    const page=await browser.newPage();
    await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<table><tr><th>금액</th></tr><tr><td>1000</td></tr></table><input type="password" value="PRIVATE"><button id="query" onclick="this.textContent=\'조회 완료\'">조회</button><button id="payment">결제</button><input type="date" id="from"><select id="card"><option value="one">카드1</option></select>'}));
    await page.goto('https://card.kbcard.com/');
    const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../kb-card-extension/background.js'),'utf8');
    await page.addScriptTag({content:source.slice(source.indexOf('function pageCommand('))});
    const read=await page.evaluate(()=>pageCommand('read',{}));
    assert.equal(read.tables[0].rows[1][0],'1000');assert.equal(JSON.stringify(read).includes('PRIVATE'),false);
    await page.evaluate(()=>pageCommand('click',{id:'query'}));assert.equal(await page.locator('#query').innerText(),'조회 완료');
    await assert.rejects(page.evaluate(()=>pageCommand('click',{id:'payment'})),/조회/);
    await page.evaluate(()=>pageCommand('date',{id:'from',value:'2026-09-01'}));assert.equal(await page.locator('#from').inputValue(),'2026-09-01');
    await page.evaluate(()=>pageCommand('select',{id:'card',value:'one'}));
  }finally{await browser.close();}
});
test('real browser: visible tables and iframe tables, download first, no input values',async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const bridge=createBridge(async()=>browser);
  try {
    // Intercept all requests before open, including KB navigation: no real financial site is contacted.
    const original=browser.newContext.bind(browser);
    browser.newContext=async options=>{
      const context=await original(options);
      await context.route('**/*',route=>{
        if(route.request().url().endsWith('/download')) return route.fulfill({headers:{'content-disposition':'attachment; filename=history.csv'},contentType:'text/csv',body:'이용일,금액\n2026-09-15,2000'});
        return route.fulfill({contentType:'text/html; charset=utf-8',body:'<input type="password" value="DO-NOT-READ"><table><tr><th>이용일</th><th>금액</th></tr><tr><td>2026-09-15</td><td>1000</td></tr></table><table hidden><tr><td>hidden</td></tr><tr><td>secret</td></tr></table><a href="/download">download</a>'});
      });
      return context;
    };
    await bridge.command({action:'open'});
    const page=browser.contexts()[0].pages()[0];
    const capture=await bridge.command({action:'capture'});
    assert.equal(capture.source,'screen');assert.equal(capture.tables.length,1);
    assert.equal(JSON.stringify(capture).includes('DO-NOT-READ'),false);
    await Promise.all([page.waitForEvent('download'),page.locator('a').click()]);
    const file=await bridge.command({action:'capture'});
    assert.equal(file.source,'download');assert.equal(file.tables[0].rows[1][1],'2000');
    await bridge.command({action:'close'});
    await assert.rejects(bridge.command({action:'capture'}),/로그인/);
  } finally { await bridge.close(); }
});
