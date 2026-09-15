/** 화면 모듈의 의존성/필수 DOM ID 및 데이터 계산 검증. 실제 브라우저 렌더링 검증을 대체하지 않는다. */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), base=path.join(root,'src/main/resources/static');
const read=p=>fs.readFileSync(p,'utf8');
const date=new Date().toISOString().slice(0,10), timestamp=date+'T07:00:00+09:00';
const aa=[['CASH','생활비'],['SAVINGS','적금'],['SECURITIES','해외 메인'],['SECURITIES','윱니 계좌']].map(([assetType,accountName],i)=>({id:i+1,assetType,accountName,ownerCode:i===3?'WIFE':'HUSBAND',status:'ACTIVE',institutionCode:assetType==='SECURITIES'?'KIS':'KB',currentBalanceKrw:'135500.49',depositKrw:'500.49',depositUsd:'0',exchangeRate:'1350',lastSyncedAt:timestamp,accountNumber:'12345678-01',kisLinked:assetType==='SECURITIES'}));
const hh=aa.filter(a=>a.assetType==='SECURITIES').map(a=>({id:a.id,accountId:a.id,symbol:'TEST',name:'테스트',currencyCode:'USD',quantity:'2',averagePrice:'40',currentPrice:'50',valueNative:'100',valueKrw:'135000',exchangeRate:'1350'}));
const cc=[{id:1,cardName:'테스트 카드',ownerCode:'HUSBAND',cardType:'CREDIT',accountId:1,status:'ACTIVE',paymentDay:10}];
const entries=[{id:1,transactionDate:date,transactionType:'EXPENSE',amount:'1000',attribution:'HUSBAND',cardId:1,categoryId:1,origin:'MANUAL',voided:false}];
const installment={id:1,cardId:1,remainingMonths:2,remainingAmount:'200000',firstPaymentDate:date,memo:'노트북 할부',active:true};
const occurrence={id:1,cardId:1,sourceKey:'CARD:1',dueDate:date,title:'테스트 카드 결제',planType:'CARD_PAYMENT',attribution:'HUSBAND',amount:'100000',state:'PENDING'};
function fixtures(url){const u=new URL(url,'http://test'),p=u.pathname;let account=u.searchParams.get('account');
 if(p==='/api/accounts')return aa;
 if(p==='/api/cards')return cc;
 if(p==='/api/installments')return [installment];
 if(p==='/api/installment-schedules')return [{id:1,installmentId:1,dueDate:date,amount:'100000',state:'PENDING'}];
 if(p==='/api/occurrences')return [occurrence];
 if(p==='/api/occurrences/1')return occurrence;
 if(p==='/api/loans')return [];
 if(p==='/api/categories')return [{id:1,name:'생활비',active:true,transactionType:'EXPENSE'}];
 if(p==='/api/metadata')return {OwnerCode:[{code:'HUSBAND',label:'동구'},{code:'WIFE',label:'윱니'}],AssetType:[{code:'CASH',label:'현금성 자산'},{code:'SAVINGS',label:'적금'}],TransactionType:[{code:'INCOME',label:'수입'},{code:'EXPENSE',label:'지출'}]};
 if(p==='/api/summary')return {assets:'542001.96',debts:'0',net:'542001.96',groups:{CASH:'135500.49',SAVINGS:'135500.49',SECURITIES:'271000.98'}};
 if(p==='/api/monthly')return {income:'0',expense:'1000',major:{생활비:'1000'},minor:{식비:'1000'}};
 if(p==='/api/transactions')return entries;
 if(p==='/api/securities/holdings')return account?hh.filter(h=>h.accountId===Number(account)):hh;
 if(p==='/api/securities/portfolio')return [{symbol:'TEST',name:'테스트',currency:'USD',quantity:'4',costNative:'160',valueNative:'200',valueKrw:'270000'},{symbol:'CASH',name:'예수금',currency:'KRW',quantity:'0',costNative:'1000.98',valueNative:'1000.98',valueKrw:'1000.98'}];
 if(p==='/api/snapshots')return [{id:1,captured_at:timestamp,total_assets:'542001.96',total_debts:'0',net_assets:'542001.96',sync_status:'성공'}];
 if(p==='/api/snapshots/1')return aa.map(a=>({item_type:'ACCOUNT',asset_type:a.assetType,owner_code:a.ownerCode,amount_krw:a.currentBalanceKrw,details:JSON.stringify(a)}));
 if(p==='/api/settings')return {kisEnabled:true,credentialConfigured:false,configuredAccountIds:[3,4],zone:'Asia/Seoul',snapshotTime:'07:00',baseUrl:'https://example.invalid'};
 return [];
}
function expandedJsp(name){let s=read(path.join(root,'src/main/webapp/WEB-INF/views',name));return s.replace(/<%@ include file="([^"]+)" %>/g,(_,f)=>read(path.join(root,'src/main/webapp/WEB-INF/views',f)));}
async function runPage(name){
 const ids=new Map();let document;
 class Element {
  constructor(id=''){this.id=id;this.value='';this.dataset={};this.classList={toggle(){},add(){},remove(){}};this.children=[];this.attrs={};this._html='';this.hidden=false;this.open=false;}
  set innerHTML(h){this._html=String(h);parse(this._html);}
  get innerHTML(){return this._html;}
  setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
  querySelector(s){return document.querySelector(s);}querySelectorAll(s){return document.querySelectorAll(s);}
  append(...e){this.children.push(...e);}replaceChildren(e){this.innerHTML=e.html||'';}
  closest(s){return s==='select'?this:null;}showModal(){this.open=true;}close(){this.open=false;}focus(){}add(){}
 }
 function parse(html){
  for(const match of html.matchAll(/<input\b[^>]*\bname="([^"]+)"[^>]*>/g)) {
   const e=new Element(match[1]);e.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';ids.set('name:'+match[1],e);
  }
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
   const [,tag,attrs,id]=match,e=new Element(id);const val=attrs.match(/\bvalue="([^"]*)"/);if(val)e.value=val[1];
   if(tag==='select'){const rest=html.slice(match.index+match[0].length).split('</select>')[0],options=[...rest.matchAll(/<option([^>]*)>/g)];const opt=options.find(o=>/\bselected\b/.test(o[1]))||options[0];e.value=opt?.[1].match(/value="([^"]*)"/)?.[1]||'';}
   ids.set(id,e);
  }
 }
 document={body:new Element(),querySelector:s=>s.startsWith('#')?ids.get(s.slice(1))||null:s.startsWith('[name=')?ids.get('name:'+s.match(/name=([^\]]+)/)[1])||null:null,querySelectorAll:()=>[],createElement:()=>new Element(),addEventListener(){}};document.body.dataset={};
 const html=expandedJsp(name+'.jsp');parse(html);
 const tpl=html.match(/<template id="page-template">([\s\S]*?)<\/template>/)[1];ids.get('page-template').content={cloneNode:()=>({html:tpl})};
 const sandbox={document,location:{pathname:name==='dashboard'?'/':'/'+name},sessionStorage:{getItem:()=>null,setItem(){}},localStorage:{getItem:()=>null,setItem(){}},Intl,Date,URLSearchParams,innerWidth:1300,innerHeight:900,fetch:async url=>({ok:true,status:200,json:async()=>fixtures(url)}),console};vm.createContext(sandbox);
 const scripts=[...html.matchAll(/value='(\/js\/[^']+)'/g)].map(m=>m[1]);
 for(const file of scripts){let code=read(path.join(base,file));if(file.endsWith('/events.js'))code=code.slice(0,code.indexOf('$("#title").textContent'));vm.runInContext(code,sandbox,{filename:file});}
 await vm.runInContext('loadBase()',sandbox);await vm.runInContext('renderPage()',sandbox);
 if(name==='cash'||name==='savings')await vm.runInContext('accountDetail(1)',sandbox);
 if(name==='cards') {
  await vm.runInContext('cardDetail(1)',sandbox);
  assert.match(ids.get('modal-body').innerHTML,/노트북 할부/);
  assert.match(ids.get('modal-body').innerHTML,/할부 회차별 예정·납부 이력/);
  await vm.runInContext('confirmOccurrence(1)',sandbox);
  assert.equal(ids.get('name:amount').value,'');
  assert.match(ids.get('modal-body').children.at(-1).innerHTML,/노트북 할부/);
  await vm.runInContext('paymentModal(1)',sandbox);
  assert.match(ids.get('modal-body').innerHTML,/name="billingMonth"/);
 }
 if(name==='planned') {
  assert.match(ids.get('plan-list').innerHTML,/노트북 할부/);
  assert.match(ids.get('calendar').innerHTML,/100,000원/);
 }
 if(name==='securities'){
  const sortRows=[
   {symbol:'A',valueKrw:'200',costKrw:'100',valueNative:'200',costNative:'100'},
   {symbol:'B',valueKrw:'500',costKrw:'450',valueNative:'110',costNative:'100'},
   {symbol:'C',valueKrw:'90',costKrw:'100',valueNative:'90',costNative:'100'},
   {symbol:'ZERO',valueKrw:'1',costKrw:'0',valueNative:'1',costNative:'0'},
   {symbol:'CASH',valueKrw:'1000'}
  ];
  sandbox.sortRows=sortRows;
  for(const [metric,desc,asc] of [
   ['value','CASH,B,A,C,ZERO','ZERO,C,A,B,CASH'],
   ['profit','A,B,ZERO,C,CASH','C,ZERO,B,A,CASH'],
   ['return','A,B,C,ZERO,CASH','C,B,A,ZERO,CASH']
  ]) {
   assert.equal(vm.runInContext(`sortPortfolio(sortRows,"${metric}","desc").map(h=>h.symbol).join(",")`,sandbox),desc);
   assert.equal(vm.runInContext(`sortPortfolio(sortRows,"${metric}","asc").map(h=>h.symbol).join(",")`,sandbox),asc);
  }
  ids.get('portfolio-sort-metric').value='profit';ids.get('portfolio-sort-metric').onchange();
  assert.ok(ids.get('portfolio-table').innerHTML.indexOf('테스트')<ids.get('portfolio-table').innerHTML.indexOf('예수금'));
  await vm.runInContext('securityDetail(3)',sandbox);assert.match(ids.get('security-tab-body').innerHTML,/25.0%/);assert.match(ids.get('security-tab-body').innerHTML,/USD \$40.00/);
  assert.equal(vm.runInContext('usdValue({currencyCode:"KRW",accountId:1},"1350")',sandbox),'1.00000000');
 }
 if(name==='snapshots')await vm.runInContext('snapshotDetail(1)',sandbox);
 assert.equal(vm.runInContext('label("OwnerCode","WIFE")',sandbox),'윱니');
 assert.equal(vm.runInContext('krw("1234.5")',sandbox),'1,235원');
 assert.equal(vm.runInContext('usdFormat("1234.567")',sandbox),'1,234.57');
 assert.equal(vm.runInContext('krw("-0.2")',sandbox),'0원');
 assert.match(vm.runInContext('lineChart([{date:"2026-09-11",value:"1500"}])',sandbox),/data-chart-tip="2026-09-11 · 1,500원/);
 const series=vm.runInContext(`transactionPoints([{transactionDate:"2026-09-11",transactionType:"EXPENSE",amount:"100"},{transactionDate:"2026-09-11",transactionType:"TRANSFER",amount:"900"},{transactionDate:"2026-09-11",transactionType:"EXPENSE",amount:"800",voided:true}],"EXPENSE","2026-09-11","2026-09-11")`,sandbox);assert.equal(series[0].value,'100.00000000');
 console.log('PASS',name,'module render + helpers');
}
module.exports={fixtures,expandedJsp,aa,hh,root};
if(require.main===module) (async()=>{for(const n of ['dashboard','assets','cash','savings','securities','cards','loans','transactions','planned','snapshots','settings'])await runPage(n);})().catch(e=>{console.error(e);process.exit(1)});
