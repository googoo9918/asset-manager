# 종목별 당일 등락률

증권 목록의 **당일 등락률 (시세일 기준)**은 전 거래일 종가 대비 시세일 가격의 변화입니다. `(시세일 가격 / 전 거래일 종가 - 1) × 100`으로 계산하며, 매입가·수량·환율 변화는 포함하지 않습니다. 기존의 매입가 대비 보유 수익률과 별도입니다.

KIS 갱신 때 국내 일별시세와 미국 NAS/NYS/AMS 일별시세의 최신 두 거래일을 조회합니다. 분할·병합 등에 따른 가격 단위 변화를 맞추기 위해 수정주가를 요청합니다. 기준일과 비교일은 API의 거래일을 그대로 사용하므로 주말·휴장일을 새 거래일로 만들지 않습니다. 장중 시세는 최종 종가와 다를 수 있으며, 화면에 거래일과 수집 시각을 표시합니다. 잔고 현재가와 일별시세는 조회 시점이 다를 수 있습니다.

각 스냅샷의 종목 상세에 거래소·거래일·전 거래일·전일 종가·시세일 가격·등락률·조회 시각을 보존합니다. 이력 조회는 계좌·소유자·종목·통화·거래일별 마지막 수집값을 표시합니다. 같은 날의 원본 스냅샷은 삭제하지 않습니다. 매도한 종목의 기록도 남으며, 아직 수집하지 않은 과거 등락률은 소급 추정하지 않습니다.

증권 화면의 **종목별 당일 등락률 이력**에서 기간(최대 1년)·종목을 검색할 수 있습니다. 표는 15건씩 표시하며 소유자 선택을 따릅니다. 종목의 **이력** 버튼은 최근 90일 기록을 엽니다. 통합 포트폴리오는 같은 종목을 여러 계좌에서 보유하면 가장 최근에 조회한 시세를 사용합니다.

시세 실패·전일 자료 부족·거래소 미확인은 `미수집`으로 표시하고 성공한 잔고 갱신은 유지합니다. 계좌 갱신 자체가 실패하면 이전 시세와 이전 조회 시각을 유지하므로 당일 데이터로 오인하지 않도록 날짜를 함께 확인할 수 있습니다. 새 기능 적용 전 스냅샷에는 이 지표가 없습니다.

기존 DB: `gradlew migrateDailyPrice` 후 앱 재시작. 이후 KIS 갱신과 스냅샷 저장 시 수집됩니다. 기존 금융 잔액이나 과거 스냅샷을 수정하지 않습니다.

공식 API 근거:
- [국내 일별시세](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_price/inquire_daily_price.py)
- [해외 일별시세](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/dailyprice/dailyprice.py)

검증: DailyPriceTest, KisDailyPriceTest, DailyPriceHistoryIntegrationTest(별도 테스트 DB), tests/page-modules.cjs, tests/browser-smoke.cjs.
