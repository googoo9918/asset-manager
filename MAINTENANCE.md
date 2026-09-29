# UI 유지보수 지도

## 페이지 한 곳만 수정할 때

1. `PageController`에서 URL→JSP 매핑 확인.
2. `views/<화면>.jsp`의 `page-template`에서 패널/검색/차트 영역 변경.
3. `static/js/pages/<화면>.js`에서 API 조회/표 생성/이벤트 변경.
4. 필요할 때만 `static/js/common`의 공통 함수를 수정.

JSP 페이지는 공유 레이아웃을 include하고 필요한 편집기와 현재 화면 스크립트만 로드합니다. `renderPage`는 현재 화면 파일에서 하나만 정의합니다. 공통 `render`는 이를 호출합니다. 모든 페이지 함수를 등록하는 전역 레지스트리는 없습니다.

## 공통 파일

| 파일 | 책임 |
|---|---|
| common/core.js | API, 금액 고정소수점 계산/표시, UI 기본 요소, 현재 조회 상태 |
| common/events.js | 공통 데이터 작업 버튼, 소유자 전환, 최초 조회 |
| common/ui.js | 화면 설명, 모바일 메뉴, 스크롤 영역의 키보드 접근, 빈 상태·상태 표시 |
| common/charts.js | 스냅샷 조회, 날짜별 선 그래프, 툴팁, 수입/지출 합산 |
| common/dialogs.js | Promise 기반 확인/입력 팝업 |
| common/order.js | 드래그·키보드 순서 편집과 DB 저장 요청 |
| common/account-list.js | 현금/적금 공통 목록 동작 |
| common/account-editor.js | 계좌 등록·수정·상세 |
| common/card-editor.js | 카드 등록·상세·결제·기존 할부 |
| common/occurrence-editor.js | 카드 상세·예정 화면에서 함께 쓰는 예정 확정·이동·취소 |
| common/loan-editor.js | 대출 등록·상세·상환 |
| common/entry-editor.js | 거래 입력과 카테고리 편집 |
| common/stock-orders.js | 주문 입력·가격 확인·결과 표시, 보유종목에서 주문 연결 |

공통 레이아웃과 모바일 규칙은 `app.css`의 `Shared application shell` 구역에서 관리합니다. 표와 차트는 화면 전체를 넓히지 않고 내부에서 스크롤합니다. 넓은 표의 첫 열은 고정하며, `ui.js`가 실제로 넘치는 영역에만 키보드 포커스와 스크롤 안내를 적용합니다. 거래내역 검색 조건은 같은 화면에서 조회 기준을 바꾸거나 저장 후 다시 그려도 유지합니다. 예정 거래의 달력/목록 선택은 브라우저에 저장합니다.

모달의 공통 저장은 처리 중 중복 제출과 닫기를 막습니다. 저장 성공 후 조회만 실패한 경우에는 저장 실패로 오인하지 않도록 별도로 안내합니다. 주문은 최종 확인 전 입력 내용으로 돌아갈 수 있으며, 수정하면 새로운 미리보기를 생성합니다. 이미 전송한 주문을 재전송하는 경로로 사용하지 않습니다.

## DB 순서 저장

`PUT /api/display-order/{CASH|SAVINGS|SECURITIES|CARDS}`

```json
{"ids":[4,3,5]}
```

Controller는 검증된 요청을 Service에 전달합니다. Service는 동일 유형 전체 ID 집합을 검증하고 공통 advisory lock 아래에서 모든 위치를 갱신합니다. Mapper는 바인드 파라미터만 사용하며 동적 테이블명을 사용하지 않습니다. 새 정렬 컬럼은 일반 계좌/카드 수정 UPDATE에서 제외하여 API 잔고 갱신이 정렬을 덮어쓰지 않습니다.

## 금액과 그래프

금액은 Java BigDecimal, 브라우저 합계는 BigInt 기반 8자리 고정소수점입니다. 그래프 좌표만 Number로 바꿉니다. KRW/USD 표시 반올림은 데이터 변경이 아닙니다. 날짜 없는 구성 차트의 툴팁은 '조회일'을 명시합니다. 스냅샷 그래프는 해당 소유자와 자산 유형의 일별 마지막 저장 값을 이용합니다.

## 테스트

주문 결과가 `UNKNOWN`이고 주문번호가 없으면 주문 상세의 **KIS 접수 내역 확인**으로 조회합니다. 후보 조회는 날짜·종목·거래소·방향·수량·가격을 대조하며 저장 상태를 변경하지 않습니다. 후보가 있어도 사용자가 선택한 뒤 기존 주문번호 검증 절차를 거칩니다. 빈 조회 결과는 확정 거절로 간주하지 않습니다. HTTP 오류에 포함된 KIS의 명시적 실패 응답(`rt_cd=1`, 유효한 `msg_cd`)은 거절 사유를 보존하며, 불명확한 응답은 `UNKNOWN`을 유지합니다. 주문 POST는 재시도하지 않습니다.

- Node만 있을 때: `node tests/page-modules.cjs`
- Java 21/Gradle 환경: `gradlew.bat test`
- Playwright 및 Chromium 설치 환경: `node tests/browser-smoke.cjs`
- 반응형·키보드·오류 복구: `node tests/ui-ux-browser.cjs` (기존 `tools/kb-card`의 Playwright와 Edge 사용)
- 주문 및 입력 수정: `node tests/stock-orders-browser.cjs`

반응형 검증은 11개 화면을 1440/390/320px에서 확인하며 `build/ui-review/`에 합성 데이터 스크린샷을 저장합니다. 실제 계좌·주문 API·개인 DB에 연결하지 않습니다. UI 변경 내역은 [2026-09 UI 개선 기록](docs/UI_UX_2026_09.md)을 참고하세요.

실제 화면 검증은 DOM 대역 테스트와 다릅니다. 실제 브라우저 테스트, 실제 PostgreSQL 마이그레이션 및 API 저장까지 확인한 뒤 운영 환경에 적용합니다.
