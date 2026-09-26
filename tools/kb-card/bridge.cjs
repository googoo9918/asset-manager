// Local, stdin/stdout-only bridge. Never read login inputs, cookies or authentication responses.
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const fs = require('node:fs/promises');
const readline = require('node:readline');
const {createRelay}=require('./relay.cjs');
const {collect}=require('./collector.cjs');
const {captureBenefits,latestBenefits,syncBenefits}=require('./benefits.cjs');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
function bounded(rows) {
  if (rows.length > MAX_ROWS || rows.some(r => r.length > 60)) throw new Error('한 번에 2,000행, 60열까지 가져올 수 있습니다. 조회 기간을 줄여주세요.');
  return rows.map(r => r.map(c => String(c ?? '').slice(0, 1000)));
}
async function parseFile(name, bytes) {
  if (bytes.length > MAX_BYTES) throw new Error('파일은 5MB 이하여야 합니다.');
  if (/\.kbcard\.json$/i.test(name)) {
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data.format!=='asset-manager-kb-tables'||data.version!==1||!Array.isArray(data.tables)||data.tables.length<1||data.tables.length>30) throw new Error('KB 가져오기 확장 프로그램의 파일인지 확인해주세요.');
    return data.tables.map(t=>{
      if(typeof t.name!=='string'||t.name.length>200||!Array.isArray(t.rows)||t.rows.some(r=>!Array.isArray(r)||r.some(c=>typeof c!=='string'||c.length>1000)))throw new Error('표 파일의 형식이 잘못되었습니다.');
      return {name:t.name,rows:bounded(t.rows)};
    });
  }
  if (/\.xlsx$/i.test(name)) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    return book.worksheets.map(sheet => {
      if (sheet.rowCount > MAX_ROWS || sheet.columnCount > 60) throw new Error('파일의 행 또는 열이 너무 많습니다.');
      const rows = [];
      sheet.eachRow({ includeEmpty: true }, row => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, cell => cells.push(cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text));
        rows.push(cells);
      });
      return { name: sheet.name, rows: bounded(rows) };
    });
  }
  if (!/\.(csv|tsv)$/i.test(name)) throw new Error('CSV·TSV·XLSX 파일을 지원합니다. XLS는 Excel에서 XLSX로 저장한 뒤 선택해주세요. PDF 전표는 원본으로 별도 보관해주세요.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('euc-kr').decode(bytes); }
  return [{ name, rows: bounded(parse(text, { bom: true, delimiter: /\.tsv$/i.test(name) ? '\t' : ',', relax_column_count: true, skip_empty_lines: true, max_record_size: 60000 })) }];
}
function kbUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'card.kbcard.com' || u.hostname.endsWith('.kbcard.com')); }
  catch { return false; }
}
async function readTables(page) {
  const tables = [];
  for (const frame of page.frames()) {
    if (!kbUrl(frame.url())) continue;
    const found = await frame.locator('table:visible').evaluateAll(elements => elements.map(table => ({
      name: table.querySelector('caption')?.textContent?.trim() || '화면 표',
      rows: Array.from(table.rows).map(row => Array.from(row.cells).map(cell => cell.innerText.trim()))
    })).filter(t => t.rows.length > 1));
    for (const table of found) tables.push({ name: `${tables.length + 1}. ${table.name}`, rows: bounded(table.rows) });
  }
  return tables;
}
function createBridge(launch = () => chromium.launch({ headless: false, channel: process.env.KB_BROWSER_CHANNEL || 'chrome' })) {
  const relay=createRelay();
  let collection={state:'idle'},collecting=false;
  let benefitsJob={state:'idle'},benefitsBusy=false;
  let browser, context, latestDownload, downloadError, pending = new Set();
  const watch = page => page.on('download', download => {
    if (!kbUrl(page.url())) return;
    latestDownload = null; downloadError = null;
    const work = (async () => {
      try {
        const path = await download.path();
        if (!path || (await fs.stat(path)).size > MAX_BYTES) throw new Error('다운로드 파일은 5MB 이하여야 합니다.');
        latestDownload = { name: download.suggestedFilename(), bytes: await fs.readFile(path) };
      } catch { downloadError = '다운로드를 읽지 못했습니다. 파일 크기를 확인하거나 파일을 직접 선택해주세요.'; }
      finally { await download.delete().catch(() => {}); }
    })();
    pending.add(work); work.finally(() => pending.delete(work));
  });
  async function close() {
    await relay.close();
    await browser?.close(); browser = context = latestDownload = downloadError = null;
    await Promise.allSettled([...pending]); latestDownload = downloadError = null;
  }
  return { close, async command(request) {
    switch (request.action) {
      case 'connect': return relay.start();
      case 'benefits':
        if(collecting||benefitsBusy)throw new Error('진행 중인 조회가 완료된 후 다시 실행해주세요.');
        await relay.start();return captureBenefits(relay);
      case 'benefits-latest': return latestBenefits();
      case 'benefits-status': return benefitsJob;
      case 'benefits-sync': {
        if(collecting||benefitsBusy)throw new Error('진행 중인 조회가 완료된 후 다시 실행해주세요.');
        await relay.start();benefitsBusy=true;benefitsJob={state:'running',progress:{phase:'connecting',saved:0}};
        syncBenefits(relay,progress=>benefitsJob={state:'running',progress},{tracking:request.tracking})
          .then(result=>benefitsJob={state:'done',result}).catch(e=>benefitsJob={state:'failed',message:e.message}).finally(()=>benefitsBusy=false);
        return benefitsJob;
      }
      case 'collect': {
        if(collecting||benefitsBusy)throw new Error('이미 수집 중입니다. 완료될 때까지 기다려주세요.');
        await relay.start();
        collecting=true;collection={state:'running',progress:{collected:0,receipts:0}};
        (async()=>{
          for(let i=0;i<65&&!relay.connected;i++){
            collection={state:'running',progress:{phase:'connecting',collected:0,receipts:0}};
            await new Promise(resolve=>setTimeout(resolve,1000));
          }
          if(!relay.connected)throw new Error('Chrome 자동 연결을 확인하지 못했습니다. KB 탭을 열고 확장 프로그램의 연결 상태를 확인해주세요. 최초 등록 후에는 코드를 다시 입력할 필요가 없습니다.');
          return collect(relay,progress=>collection={state:'running',progress},{withReceipts:request.withReceipts!==false});
        })()
          .then(result=>collection={state:'done',result}).catch(e=>collection={state:'failed',message:e.message}).finally(()=>collecting=false);
        return collection;
      }
      case 'collection': return collection;
      case 'inspect': return relay.command('read');
      case 'click': case 'select': case 'date': case 'receipt': case 'close-popup': return relay.command(request.action,request.args);
      case 'open': {
        if (browser?.isConnected() && context.pages().length) {
          await context.pages().at(-1).bringToFront(); return { opened: true };
        }
        await close();
        browser = await launch();
        context = await browser.newContext({ acceptDownloads: true, locale: 'ko-KR' });
        context.on('page', watch);
        const page = await context.newPage();
        await page.goto('https://card.kbcard.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        return { opened: true };
      }
      case 'capture': {
        if(relay.connected){const pages=await relay.command('read');return {source:'connected-chrome',tables:pages.flatMap(p=>p.tables||[])};}
        if (!browser?.isConnected() || !context.pages().length) throw new Error('로그인 브라우저를 먼저 열어주세요. 닫혔다면 다시 로그인해주세요.');
        await Promise.all([...pending]);
        if (downloadError) throw new Error(downloadError);
        if (latestDownload) return { source: 'download', tables: await parseFile(latestDownload.name, latestDownload.bytes) };
        const tables = [];
        for (const page of context.pages()) if (kbUrl(page.url())) tables.push(...await readTables(page));
        if (!tables.length) throw new Error('읽을 표가 없습니다. 로그인 후 이용내역을 조회하거나 파일을 내려받아 주세요.');
        return { source: 'screen', tables };
      }
      case 'file': return { source: 'file', tables: await parseFile(request.name, Buffer.from(request.base64, 'base64')) };
      case 'close': await close(); return { closed: true };
      default: throw new Error('지원하지 않는 요청입니다.');
    }
  }};
}
if (require.main === module) {
  const bridge = createBridge();
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  (async () => {
    for await (const line of input) {
      try {
        if (line.length > 8 * 1024 * 1024) throw new Error('파일이 너무 큽니다.');
        const result = await bridge.command(JSON.parse(line));
        process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
      } catch (e) {
        // Do not print Playwright diagnostics/URLs or file contents to logs.
        const message = /[가-힣]/.test(e.message) ? e.message : '브라우저 또는 파일을 읽지 못했습니다. Chrome 설치와 파일 형식을 확인해주세요.';
        process.stdout.write(JSON.stringify({ ok: false, message }) + '\n');
      }
    }
    await bridge.close();
  })();
}
module.exports = { parseFile, kbUrl, readTables, createBridge };
