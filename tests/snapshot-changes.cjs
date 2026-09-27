const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const elements=new Map();
const document={body:{dataset:{}},querySelector(s){if(!elements.has(s))elements.set(s,{});return elements.get(s);},addEventListener(){}};
const sandbox={document,location:{pathname:'/'},sessionStorage:{getItem(){}},Intl,Date,console};
vm.createContext(sandbox);
for(const file of ['core','charts'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/main/resources/static/js/common',file+'.js'),'utf8'),sandbox);
const account=(id,amount,type='CASH',owner='HUSBAND',name='계좌')=>({entity_id:id,item_type:'ACCOUNT',asset_type:type,owner_code:owner,amount_krw:amount,details:JSON.stringify({accountName:name})});
const loan=(id,amount)=>({...account(id,amount),item_type:'LOAN',details:'{"loanName":"대출"}'});
const position=(id,amount,symbol='TEST',entity=1)=>({...account(entity,amount,'SECURITIES'),item_type:'POSITION',details:JSON.stringify({accountId:id,symbol,name:symbol,currencyCode:'USD',quantity:'1',currentPrice:'10',exchangeRate:'1300'})});
function changes(before,after,owner='JOINT',metric='net_assets'){
  Object.assign(sandbox,{before,after,owner,metric});
  const result=vm.runInContext('snapshotChanges(before,after,owner,metric)',sandbox);
  sandbox.result=result;
  assert.equal(vm.runInContext('decimal(snapshotTotal(after,owner,metric))-decimal(snapshotTotal(before,owner,metric))',sandbox),vm.runInContext('decimal(result.change)',sandbox));
  return result;
}
test('one million increase reconciles cash, securities and reduced debt without counting positions twice',()=>{
  const a=[account(1,'1000000'),account(2,'2000000','SECURITIES'),loan(1,'500000'),position(2,'1900000')];
  const b=[account(1,'1500000'),account(2,'2300000','SECURITIES'),loan(1,'300000'),position(2,'2100000','TEST',999)];
  const c=changes(a,b);
  assert.equal(Number(c.change),1000000);assert.equal(c.rows.length,3);
  assert.equal(Number(c.rows.find(r=>r.item.item_type==='LOAN').contribution),200000);
  const children=c.rows.find(r=>r.item.asset_type==='SECURITIES').children;
  assert.equal(children.length,2);assert.equal(Number(children[0].change),200000);assert.equal(Number(children[1].change),100000);
  assert.equal(Number(changes(a,b,'JOINT','total_assets').change),800000);
  assert.equal(Number(changes(a,b,'JOINT','total_debts').change),-200000);
  assert.equal(Number(changes(a,b,'JOINT','SECURITIES').change),300000);
});
test('scope entries, exits, renamed accounts and type transfers use each historical side',()=>{
  const a=[account(1,'100','CASH','HUSBAND','예전 이름'),account(2,'200')];
  const b=[account(1,'100','SAVINGS','WIFE','새 이름'),account(3,'50')];
  assert.equal(Number(changes(a,b).change),-150);
  assert.equal(Number(changes(a,b,'HUSBAND').change),-250);
  assert.equal(Number(changes(a,b,'WIFE').change),100);
  assert.equal(Number(changes(a,b,'JOINT','CASH').change),-250);
  assert.equal(Number(changes(a,b,'JOINT','SAVINGS').change),100);
  assert.equal(changes(a,b).rows.find(r=>r.key==='ACCOUNT:1').name,'새 이름');
});
test('offsetting transfers and positions remain visible even when net change is zero',()=>{
  const a=[account(1,'100'),account(2,'200','SECURITIES'),position(2,'50','A'),position(2,'100','B')];
  const b=[account(1,'100'),account(2,'200','SECURITIES'),position(2,'100','A'),position(2,'50','B')];
  const c=changes(a,b);assert.equal(Number(c.change),0);
  Object.assign(sandbox,{from:{captured_at:'2026-09-01T07:00:00+09:00'},to:{captured_at:'2026-09-02T07:00:00+09:00'}});
  const html=vm.runInContext('snapshotChangesHtml(before,after,owner,metric,from,to)',sandbox);
  assert.match(html,/종목·예수금 변동 2건/);assert.doesNotMatch(html,/이 기간에 금액 변동이 없습니다/);
  assert.equal(Number(changes([account(1,'100'),account(2,'0')],[account(1,'0'),account(2,'100')]).change),0);
});
test('fractional values, reverse comparisons, empty and identical snapshots',()=>{
  const a=[account(1,'100.01'),loan(1,'50.03')],b=[account(1,'100.02'),loan(1,'50.01')];
  assert.equal(changes(a,b).change,'0.03000000');
  assert.equal(changes(b,a).change,'-0.03000000');
  assert.equal(Number(changes(a,a).change),0);assert.equal(changes([],[]).rows.length,0);
  assert.equal(changes([account(1,'9007199254740993.01')],[account(1,'9007199254740993.02')]).change,'0.01000000');
});
test('labels and sync messages are escaped',()=>{
  Object.assign(sandbox,{before:[],after:[account(1,'1','CASH','HUSBAND','<img src=x onerror=alert(1)>')],from:{captured_at:'2026-09-01',sync_status:'<script>'},to:{captured_at:'2026-09-02'}});
  const html=vm.runInContext('snapshotChangesHtml(before,after,"JOINT","net_assets",from,to)',sandbox);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script/);
});
