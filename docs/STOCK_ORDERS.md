# KIS 주식 주문

증권 화면의 **주식 주문 → 매수 / 매도**에서 연결 계좌, 거래소, 종목, 수량을 선택합니다. 가격 조회는 주문을 전송하지 않습니다. 최종 확인 화면의 주문 전송 버튼을 눌러야 전송됩니다.

**통합 포트폴리오 또는 계좌 상세의 보유종목 표에서 종목명**을 눌러도 주문 화면을 열 수 있습니다. 종목코드와 보유 계좌의 거래소를 자동 입력하며, 방향에서 매수·매도를 선택합니다. 여러 계좌에 같은 종목이 있으면 주문할 보유 계좌를 먼저 선택합니다. 거래소 정보가 없는 과거 보유종목은 거래소를 직접 확인하여 선택해야 합니다. 저장된 보유 수량을 참고용으로 표시하며, 실제 매도 가능 수량은 KIS가 확인합니다. 기본 수량은 1주, 방식은 현재가 지정가이며 최종 확인 후 전송합니다.

| 거래소 | 매수·매도 지원 방식 |
| --- | --- |
| 국내 KRX | 지정가, 현재가 지정가, 시장가 |
| 미국 NASDAQ / NYSE / AMEX | 지정가, 현재가 지정가 |

현재가 지정가는 KIS에서 조회한 가격을 고정하여 지정가 주문합니다. 확인 화면 이후 시세가 바뀌어도 주문 가격을 바꾸지 않으며 미체결될 수 있습니다. 시장가의 예상 금액은 조회 가격 기준으로, 실제 체결 금액이 달라질 수 있습니다. 수수료와 세금은 포함하지 않습니다. 정수 수량만 지원하며, 호가 단위·잔액·매도 가능 수량·장 운영시간에 따른 최종 접수 가능 여부는 KIS가 검증합니다. 예약 주문, 장외·야간 주문, 정정 주문은 지원하지 않습니다.

## 설치와 설정

기존 DB에는 `gradlew.bat migrateStockOrders --offline`을 실행한 뒤 앱을 재시작합니다. 신규 DB용 `db/schema.sql`에도 테이블을 포함했습니다. 마이그레이션은 주문 테이블·인덱스만 추가하며 잔액과 기존 거래를 바꾸지 않습니다.

기본적으로 주문은 비활성화되어 있습니다. `application-local.yml`의 기존 `kis` 항목에 다음 설정을 병합합니다. 실전/모의에 맞는 계좌번호와 API 키를 사용해야 합니다.

```yaml
kis:
  enabled: true
  trading-enabled: true
  # 모의 투자 (모의 전용 키와 계좌 필요)
  base-url: https://openapivts.koreainvestment.com:29443
  # 실전 투자: https://openapi.koreainvestment.com:9443
```

기존 계좌별 `kis.accounts.<계좌ID>.app-key/app-secret` 설정을 재사용합니다. 계좌는 사용 중인 KIS 연결 증권계좌여야 합니다. 서버 주소는 위 두 공식 주소만 허용하며 확인 화면과 내역에 실전/모의를 표시합니다. 읽기용 KIS 연결만 켜서는 주문이 활성화되지 않습니다. 기존 앱처럼 로컬 전용 서비스로 사용합니다.

## 주문 상태와 복구

- 미리보기는 120초 동안 유효합니다. 계좌번호·소유자·API 키·실전/모의 서버가 변경되면 해당 미리보기를 전송하지 않습니다.
- DB에 `SENDING`을 먼저 커밋하고 KIS에 한 번 전송합니다. 같은 미리보기의 중복 클릭·동시 요청은 기존 상태를 반환합니다. 금융 POST는 조회 API의 자동 재시도를 사용하지 않습니다.
- `ACCEPTED`는 접수이며 체결 완료가 아닙니다. **체결 조회**로 부분 체결, 전량 체결, 잔량을 확인합니다. 주문 접수만으로 보유종목·잔액·스냅샷은 바꾸지 않습니다. 체결 후 기존 자산 갱신으로 실제 보유량을 반영합니다.
- **미체결 잔량 취소**는 최신 체결·취소 가능 수량을 조회한 뒤 한 번 요청합니다. `CANCEL_PENDING`은 취소 접수이며, 최종 확인까지 재취소하지 않습니다. 응답 유실은 `CANCEL_UNKNOWN`으로 표시합니다.
- 전송 응답 유실이나 프로세스 종료는 `UNKNOWN`/`SENDING`으로 남습니다. 자동 재전송하지 않습니다. KIS 앱에서 주문을 확인하고 상세 화면에 주문번호를 연결하면 날짜·종목·매수매도·수량·가격을 대조한 뒤 체결 상태를 가져옵니다. 조회 결과에 없다는 사실만으로 실패·취소를 확정하지 않습니다.
- 결과 불명 주문이 있는 계좌의 신규 미리보기·전송은 차단합니다. 주문 자체가 KIS에 도달하지 않아 연결할 주문번호도 없는 경우는 자동 해제하지 않습니다. KIS 내역을 확인한 후 운영자가 원인을 확인해야 합니다.
- 오래된 조회가 최신 체결 정보를 덮어쓰지 않도록 버전 비교와 체결 수량 검증을 적용합니다. 이 앱에서 생성한 최근 200개 주문을 소유자별로 조회하며 15개씩 표시합니다. KIS 앱에서 직접 만든 주문은 이 목록에 자동 수집하지 않습니다.

## 검증

`gradlew.bat test --offline`, `node tests/page-modules.cjs`, `node tests/stock-orders-browser.cjs`로 단위·UI 테스트를 실행합니다. 브라우저 테스트는 `tools/kb-card`의 Playwright와 Edge를 사용하며 모든 API를 모킹합니다. `StockOrderIntegrationTest`는 `ASSET_INSTALLMENT_DB_TEST=true`일 때에만 포트 55439의 별도 `installment_test` PostgreSQL DB에서 실행합니다. 실제 계좌에 주문을 전송하는 테스트는 없습니다.

## KIS 공식 명세

- [국내 현금 주문](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/order_cash/order_cash.py)
- [해외 주문](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/order/order.py): 미국 일반 주문은 지정가를 사용합니다. 모의 매도 TR은 명세의 `VTTT1001U`를 명시적으로 사용합니다.
- [국내 체결 조회](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_ccld/inquire_daily_ccld.py), [해외 체결 조회](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/inquire_ccnl/inquire_ccnl.py)
- [국내 취소](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/order_rvsecncl/order_rvsecncl.py), [해외 취소](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/order_rvsecncl/order_rvsecncl.py)
