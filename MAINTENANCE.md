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
| common/charts.js | 스냅샷 조회, 날짜별 선 그래프, 툴팁, 수입/지출 합산 |
| common/dialogs.js | Promise 기반 확인/입력 팝업 |
| common/order.js | 드래그·키보드 순서 편집과 DB 저장 요청 |
| common/account-list.js | 현금/적금 공통 목록 동작 |
| common/account-editor.js | 계좌 등록·수정·상세 |
| common/card-editor.js | 카드 등록·상세·결제·기존 할부 |
| common/occurrence-editor.js | 카드 상세·예정 화면에서 함께 쓰는 예정 확정·이동·취소 |
| common/loan-editor.js | 대출 등록·상세·상환 |
| common/entry-editor.js | 거래 입력과 카테고리 편집 |

## DB 순서 저장

`PUT /api/display-order/{CASH|SAVINGS|SECURITIES|CARDS}`

```json
{"ids":[4,3,5]}
```

Controller는 검증된 요청을 Service에 전달합니다. Service는 동일 유형 전체 ID 집합을 검증하고 공통 advisory lock 아래에서 모든 위치를 갱신합니다. Mapper는 바인드 파라미터만 사용하며 동적 테이블명을 사용하지 않습니다. 새 정렬 컬럼은 일반 계좌/카드 수정 UPDATE에서 제외하여 API 잔고 갱신이 정렬을 덮어쓰지 않습니다.

## 금액과 그래프

금액은 Java BigDecimal, 브라우저 합계는 BigInt 기반 8자리 고정소수점입니다. 그래프 좌표만 Number로 바꿉니다. KRW/USD 표시 반올림은 데이터 변경이 아닙니다. 날짜 없는 구성 차트의 툴팁은 '조회일'을 명시합니다. 스냅샷 그래프는 해당 소유자와 자산 유형의 일별 마지막 저장 값을 이용합니다.

## 테스트

- Node만 있을 때: `node tests/page-modules.cjs`
- Java 21/Gradle 환경: `gradlew.bat test`
- Playwright 및 Chromium 설치 환경: `node tests/browser-smoke.cjs`

실제 화면 검증은 DOM 대역 테스트와 다릅니다. 실제 브라우저 테스트, 실제 PostgreSQL 마이그레이션 및 API 저장까지 확인한 뒤 운영 환경에 적용합니다.
