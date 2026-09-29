// pages/settings.js — 연결 안내와 수동 거래 기록을 분리합니다.
async function settings() {
  const [s,trading]=await Promise.all([api('/settings'),api('/securities/orders/settings')]);
  pageTemplate();
  const names=s.configuredAccountIds.map(id=>state.accounts.find(a=>eq(a.id,id))?.accountName||`계좌 ${id}`);
  $('#settings-summary').innerHTML=detailGrid({'KIS 연동':s.kisEnabled?'사용':'사용 안 함','공통 인증정보':s.credentialConfigured?'설정됨':'미설정 (개별 설정 사용 가능)','개별 인증 계좌':names.join(', ')||'없음','기준 시간대':s.zone,'자동 스냅샷':s.snapshotTime+' (앱 실행 중)','API 주소':s.baseUrl});
  $('#settings-trading').innerHTML=`<p>${statusBadge(trading.enabled?'주문 활성화':'주문 비활성화',trading.enabled?'success':'neutral')} ${statusBadge(trading.environment==='REAL'?'실전 투자':trading.environment==='DEMO'?'모의 투자':'서버 설정 확인',trading.environment==='REAL'?'warning':'info')}</p>`;
  $('#import-button').append(button('배당·입출금 기록',openSecurityRecord));
}
function openSecurityRecord() {
  const accounts=own(state.accounts).filter(a=>a.assetType==='SECURITIES'&&a.status==='ACTIVE');
  if(!accounts.length){notice('선택한 소유자의 증권계좌를 먼저 등록해주세요.',true);return;}
  modal('배당·입출금 기록',
    '<p>증권사 거래내역을 보고 입력하세요. 계좌 잔액과 보유 수량은 변경하지 않으며, 배당은 수입으로도 기록합니다.</p><div class="fields">'+
    select('accountId','증권계좌',accounts.map(a=>`<option value="${a.id}">${esc(a.accountName)}</option>`).join(''))+
    field('tradeDate','거래일',today(),'date','required')+
    select('tradeType','거래 종류','<option value="DIVIDEND">배당금</option><option value="DEPOSIT">입금</option><option value="WITHDRAWAL">출금</option>')+
    field('symbol','종목 코드 (배당금 필수)','','text','maxlength="30"')+
    select('currencyCode','거래 통화','<option value="KRW">원화 (KRW)</option><option value="USD">달러 (USD)</option>')+
    moneyField('amount','거래 금액 (선택한 통화)','')+
    field('exchangeRate','거래 당시 환율 (1 USD당 원)','1','number','required min="0.00000001" step="0.00000001"')+
    field('externalId','증권사 거래번호','','text','required maxlength="100"')+
    '</div><p class="muted">같은 계좌의 동일 거래번호는 다시 기록하지 않습니다. 거래번호는 증권사 거래내역에서 확인해주세요.</p>',async()=>{
      const r=formData($('#modal-body'));
      const row={...r,quantity:'0',symbol:(r.symbol||'').trim().toUpperCase(),externalId:(r.externalId||'').trim(),exchangeRate:r.currencyCode==='KRW'?'1':r.exchangeRate};
      delete row.accountId;
      if(!row.externalId)throw new Error('증권사 거래번호를 입력해주세요.');
      if(row.tradeType==='DIVIDEND'&&!row.symbol)throw new Error('배당금을 받은 종목 코드를 입력해주세요.');
      if(decimal(row.amount)<=0n||decimal(row.exchangeRate)<=0n)throw new Error('금액과 환율은 0보다 커야 합니다.');
      const existing=await api('/securities/trades?account='+r.accountId);
      if(existing.some(t=>t.externalId===row.externalId))throw new Error('이미 기록된 거래번호입니다. 증권계좌의 거래내역을 확인해주세요.');
      return api('/securities/'+r.accountId+'/trades/import','POST',[row]);
    });
  const currency=()=>{
    const won=$('[name=currencyCode]').value==='KRW',fx=$('[name=exchangeRate]');
    fx.readOnly=won;fx.value=won?'1':'';fx.closest('label').hidden=won;
  };
  $('[name=currencyCode]').onchange=currency;currency();
  const type=()=>{$('[name=symbol]').required=$('[name=tradeType]').value==='DIVIDEND';};
  $('[name=tradeType]').onchange=type;type();
}
async function renderPage() { await settings(); }
