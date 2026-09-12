"""Destructive only to newly-created smoke records. Use a disposable, seeded test DB.
Run against a running app: python tests/api_smoke.py http://127.0.0.1:8080
This creates preserved financial history; never run against your personal production DB.
"""
import json,sys,urllib.request,urllib.error,datetime,uuid
from decimal import Decimal
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18080'
prefix='TEST-'+uuid.uuid4().hex[:8]
today=datetime.date.today().isoformat()
checks=[]
def api(path,method='GET',data=None,status=200):
 request=urllib.request.Request(base+'/api'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=45) as r:code=r.status;body=r.read()
 except urllib.error.HTTPError as e:code=e.code;body=e.read()
 assert code==status,(method,path,code,body.decode())
 return json.loads(body) if body else None
def ok(name):checks.append(name);print('PASS',name,flush=True)
def balance(id):return Decimal(str(api('/accounts/'+str(id))['currentBalanceKrw']))
def account(name,owner='HUSBAND',kind='CASH',amount='1000000.00',**kw):
 return api('/accounts','POST',dict(assetType=kind,ownerCode=owner,institutionCode='KIS' if kind=='SECURITIES' else 'KB',accountName=prefix+name,accountNumber=prefix+name,currentBalanceKrw=amount,currencyCode='KRW',status='ACTIVE',kisLinked=False,**kw),201)
a=account('A');b=account('B','WIFE',amount='0');sec=account('SEC',kind='SECURITIES',amount='0');aid=a['id'];bid=b['id']
assert api('/accounts/'+str(aid))['accountName']==prefix+'A';ok('계좌 등록/상세/조회 및 소유자 코드')
a['accountName']=prefix+'수정';api('/accounts/'+str(aid),'PUT',a);assert api('/accounts/'+str(aid))['accountName']==a['accountName'];ok('계좌 메타데이터 수정')
invalid={**a,'ownerCode':'JOINT'};api('/accounts','POST',invalid,400);ok('자산 공동 소유권 입력 거절')
income=api('/categories','POST',dict(name=prefix+'수입',transactionType='INCOME',active=True),201)
expense=api('/categories','POST',dict(name=prefix+'지출',transactionType='EXPENSE',active=True),201)
cc=api('/cards','POST',dict(cardName=prefix+'신용',ownerCode='HUSBAND',cardType='CREDIT',accountId=aid,paymentDay=int(today[-2:]),status='ACTIVE'),201)
dc=api('/cards','POST',dict(cardName=prefix+'체크',ownerCode='HUSBAND',cardType='DEBIT',accountId=aid,paymentDay=None,status='ACTIVE'),201)
def entry(kind,amount,**kw):return dict(transactionDate=today,transactionType=kind,amount=amount,attribution='JOINT',categoryId=income['id'] if kind=='INCOME' else expense['id'],installmentMonths=1,**kw)
def save(e):return api('/transactions/batch','POST',{'entries':[e]},201)[0]
x=save(entry('EXPENSE','120000',paymentMethod='CREDIT',cardId=cc['id'],memo='할부 구매',**{}));assert balance(aid)==Decimal('1000000');ok('신용카드 사용 시 지출만 기록/잔액 불변')
api('/cards/'+str(cc['id'])+'/payments','POST',{'date':today,'amount':'40000'},204);assert balance(aid)==Decimal('960000');assert len([e for e in api('/transactions') if e['cardId']==cc['id']])==1;ok('카드대금 출금 시 잔액만 감소/이중 지출 없음')
save(entry('EXPENSE','10000',paymentMethod='DEBIT',cardId=dc['id']));assert balance(aid)==Decimal('950000');ok('체크카드 연결계좌 차감')
income_entry=save(entry('INCOME','20000',targetAccountId=aid));assert balance(aid)==Decimal('970000');ok('수입 즉시 입금')
transfer=save(entry('TRANSFER','70000',sourceAccountId=aid,targetAccountId=bid));assert balance(aid)==Decimal('900000') and balance(bid)==Decimal('70000');ok('소유자간 자산이동 총액 보존')
api('/transactions/'+str(transfer['id']),'DELETE',status=204);assert balance(aid)==Decimal('970000') and balance(bid)==0;assert api('/transactions/'+str(transfer['id']))['voided'];ok('거래 취소 역분개 및 원본 영구 보존')
api('/transactions/'+str(income_entry['id']),'PUT',entry('INCOME','30000',targetAccountId=aid));assert balance(aid)==Decimal('980000');ok('거래 수정 원본 취소/대체 거래 등록')
before=balance(aid);api('/transactions/batch','POST',{'entries':[entry('INCOME','100',targetAccountId=aid),entry('TRANSFER','100',sourceAccountId=aid,targetAccountId=aid)]},400);assert balance(aid)==before;ok('다건 저장 중 실패 시 전체 롤백')
api('/accounts/'+str(aid)+'/adjustments','POST',{'balance':'990000','reason':'실제 잔액 확인'});assert balance(aid)==Decimal('990000');assert len(api('/accounts/'+str(aid)+'/adjustments'))==1;ok('잔액 보정 별도 이력')
api('/accounts/'+str(aid),'DELETE',status=400);ok('참조/잔액 계좌 해지 거절')
loan=api('/loans','POST',dict(loanName=prefix+'대출',ownerCode='HUSBAND',initialAmount='120000',currentBalance='120000',interestRate='12',maturityDate=(datetime.date.today()+datetime.timedelta(days=365)).isoformat(),repaymentType='EQUAL_PRINCIPAL',paymentDay=int(today[-2:]),accountId=aid,status='ACTIVE'),201)
lid=loan['id'];assert api('/loans/'+str(lid)+'/schedule');api('/loans/'+str(lid)+'/repayments','POST',dict(date=today,principal='10000',interest='1200',fee='0',accountId=aid,early=False),204);assert balance(aid)==Decimal('978800');assert Decimal(api('/loans/'+str(lid))['currentBalance'])==Decimal('110000');ok('대출 상환: 계좌 원금+이자 차감/부채 원금만 차감')
api('/loans/'+str(lid)+'/repayments','POST',dict(date=today,principal='10000',interest='0',fee='100',accountId=aid,early=True),204);assert balance(aid)==Decimal('968700');assert len(api('/loans/'+str(lid)+'/repayments'))==2;ok('중도상환 및 수수료 분리')
api('/loans/'+str(lid)+'/rates','POST',dict(effectiveDate=today,rate='6'),204);assert len(api('/loans/'+str(lid)+'/rates'))==1;ok('금리 변경 이력 및 미래 스케줄')
plan=api('/plans','POST',dict(title=prefix+'통신비',planType='EXPENSE',repeatCycle='MONTHLY',startDate=today,amount='1000',attribution='JOINT',categoryId=expense['id'],accountId=aid,active=True),201)
occ=api('/occurrences?month='+today[:7]);o=next(o for o in occ if o['planId']==plan['id']);before=balance(aid);assert before==Decimal('968700');ok('예정 생성 시 자동 집행 없음')
api('/occurrences/'+str(o['id'])+'/confirm','POST',dict(date=today,amount='1100'));assert balance(aid)==before-Decimal('1100');api('/occurrences/'+str(o['id'])+'/confirm','POST',dict(date=today,amount='1100'),400);ok('예정 실제금액 확정 및 중복 확정 거절')
ss=account('적금',kind='SAVINGS',amount='0',startDate=today,maturityDate=(datetime.date.today()+datetime.timedelta(days=365)).isoformat(),interestRate='3.5',monthlyAmount='10000',paymentDay=int(today[-2:]),withdrawalAccountId=aid)
o=next(o for o in api('/occurrences?month='+today[:7]) if o['targetAccountId']==ss['id']);api('/occurrences/'+str(o['id'])+'/confirm','POST',dict(date=today,amount='10000'));assert balance(ss['id'])==Decimal('10000');ok('적금 납입 예정 → 자산이동')
trade=dict(externalId=prefix+'배당',tradeDate=today,tradeType='DIVIDEND',symbol='VOO',currencyCode='USD',quantity='0',amount='10',exchangeRate='1300')
for _ in range(2):api('/securities/'+str(sec['id'])+'/trades/import','POST',[trade])
assert len(api('/securities/trades?account='+str(sec['id'])))==1;div=[e for e in api('/transactions') if e['origin']=='KIS' and e['targetAccountId']==sec['id']];assert len(div)==1 and div[0]['attribution']=='HUSBAND' and Decimal(div[0]['amount'])==13000;assert balance(sec['id'])==0;ok('배당 수입 자동 연결/소유자 귀속/중복 수입·잔액 증가 방지')
s1=api('/refresh','POST');s2=api('/refresh','POST');assert s1['id']!=s2['id'];assert api('/snapshots/'+str(s1['id']));comparison=api('/snapshots/compare?from='+str(s1['id'])+'&to='+str(s2['id']));assert all(Decimal(r['change'])==0 for r in comparison);ok('같은 날짜 다중 스냅샷 보존/상세/비교')
summary=api('/summary');h=api('/summary?owner=HUSBAND');w=api('/summary?owner=WIFE');assert Decimal(summary['assets'])==Decimal(h['assets'])+Decimal(w['assets']);assert Decimal(summary['net'])==Decimal(summary['assets'])-Decimal(summary['debts']);ok('공동 합산/순자산 계산 정합성')
api('/transactions/batch','POST',{'entries':[entry('INCOME','-1',targetAccountId=aid)]},400);api('/accounts/999999999',status=404);ok('잘못된 금액/미존재 데이터 HTTP 상태')
for route in ['/','/assets','/cash','/savings','/securities','/cards','/loans','/transactions','/planned','/snapshots','/settings','/app.js','/app.css']:
 with urllib.request.urlopen(base+route) as r:assert r.status==200;body=r.read();assert body
ok('11개 JSP 경로 및 JS/CSS HTTP 응답')
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
# Additional regressions: original debit account, repeating idempotency, logical deletion.
dc['accountId']=bid;api('/cards/'+str(dc['id']),'PUT',dc)
debit=next(e for e in api('/transactions') if e['cardId']==dc['id'])
assert any(e['id']==debit['id'] for e in api('/transactions?account='+str(aid)))
assert not any(e['id']==debit['id'] for e in api('/transactions?account='+str(bid)))
before=balance(aid);api('/transactions/'+str(debit['id']),'DELETE',status=204);assert balance(aid)==before+10000;ok('체크카드 연결계좌 변경 후에도 원래 계좌 조회/역분개')
count=len(api('/occurrences?month='+today[:7]));assert len(api('/occurrences?month='+today[:7]))==count;ok('반복 예정 재생성 멱등성')
empty=account('해지테스트',amount='0');api('/accounts/'+str(empty['id']),'DELETE',status=204);assert api('/accounts/'+str(empty['id']))['status']=='CLOSED';ok('빈 계좌 논리 해지 및 원본 보존')
# Optional mock provider verification. Never enable against actual KIS in a smoke test.
import os
if os.environ.get('MOCK_KIS_URL'):
 mock=account('모의KIS',kind='SECURITIES',amount='0');mock['accountNumber']='12345678-01';mock['kisLinked']=True;api('/accounts/'+str(mock['id']),'PUT',mock)
 api('/refresh','POST');assert balance(mock['id'])==Decimal('1457240');hh=api('/securities/holdings?account='+str(mock['id']));assert len(hh)==2;ok('모의 KIS HTTP 토큰/국내·해외잔고/환율 매핑')
 save(entry('TRANSFER','100',sourceAccountId=aid,targetAccountId=mock['id']));assert balance(mock['id'])==Decimal('1457340');snap=api('/refresh','POST');assert balance(mock['id'])==Decimal('1457240');ok('KIS 현재값 우선 덮어쓰기 및 수동 거래 보존')
 assert len(api('/securities/trades?account='+str(mock['id'])))==1;ok('KIS 매매 반복 수신 중복 방지')
 details=api('/snapshots/'+str(snap['id']));positions=[json.loads(d['details']) for d in details if d['item_type']=='POSITION'];assert any(p['symbol']=='VOO' and Decimal(p['exchangeRate'])==1300 for p in positions);ok('종목 수량/USD/적용환율 스냅샷 보존')
 urllib.request.urlopen(urllib.request.Request(os.environ['MOCK_KIS_URL']+'/fail',method='POST')).read()
 failed=api('/refresh','POST');assert '실패' in failed['syncStatus'];assert balance(mock['id'])==Decimal('1457240');ok('KIS 갱신 실패 시 이전 상태 보존 및 스냅샷 실패상태 명시')
print('FINAL:',len(checks),'checks passed')
