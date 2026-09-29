<%@ page pageEncoding="UTF-8" %>
<%-- securities 화면 구조. 데이터 조회와 이벤트는 js/pages/securities.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <div class="section-links" id="security-section-tabs" aria-label="증권 화면"><a href="#security-portfolio">보유 종목</a><a href="#security-allocation">종목별 비중</a><a href="#security-orders">주문 내역</a><a href="#security-accounts">계좌 관리</a><a href="#security-history">등락률 이력</a><a href="#security-trend">자산 추이</a></div>
    <div id="security-overview" class="security-overview"></div>
    <section class="panel" id="security-accounts"><h2>증권계좌</h2>
        <div class="toolbar">
            <button id="new-security" class="primary">증권계좌 등록</button>
            <button type="button" id="reorder">순서 편집</button>
            <input id="security-search" placeholder="계좌명 검색" aria-label="계좌명 검색"></div>
        <p class="muted">원화와 달러를 함께 표시합니다. 환산액은 각 계좌에 저장된 환율 기준이며 실제 달러 보유액과 구분됩니다.</p>
        <div id="security-list"></div>
    </section>
    <section class="panel" id="security-portfolio"><div class="panel-heading"><div><h2>보유 종목</h2><p class="muted">종목명을 눌러 매수·매도 · 평가금액에는 예수금을 포함합니다.</p></div></div>
        <div class="toolbar">
            <input type="search" id="portfolio-search" placeholder="종목명 또는 코드 검색" aria-label="보유 종목 검색">
            <label>정렬 기준 <select id="portfolio-sort-metric">
                <option value="value">평가금액 (KRW)</option>
                <option value="profit">평가손익 (KRW)</option>
                <option value="return">수익률 (환율 제외)</option>
            </select></label>
            <label>정렬 방향 <select id="portfolio-sort">
                <option value="desc">높은 순</option>
                <option value="asc">낮은 순</option>
            </select></label></div>
        <p id="portfolio-results" class="muted" role="status"></p>
        <div id="portfolio-table"></div>
        <p class="muted">통합 평단가는 수량 가중평균입니다. 수익률은 환율 손익을 제외하며, 당일 등락률은 표시된 시세일 기준입니다.</p>
    </section>
    <section class="panel" id="security-allocation"><div class="panel-heading"><div><h2>종목별 자산 비중</h2><p class="muted">선택한 소유자의 보유 종목을 원화 평가금액으로 비교합니다. 같은 종목·통화는 계좌를 합산합니다.</p></div></div>
        <div class="toolbar"><label><input type="checkbox" id="allocation-cash">예수금 포함</label>
            <div id="portfolio-layout" class="segmented" role="group" aria-label="포트폴리오 형태"><button type="button" data-layout="bar">막대</button><button type="button" data-layout="pie">원형</button></div>
        </div>
        <p id="allocation-summary" role="status"></p>
        <div id="portfolio-chart"></div>
        <p class="muted">비중은 표시된 평가금액 합계 기준입니다. 저장된 시세·계좌 환율을 사용하며, 반올림으로 비중 합계가 100%와 다를 수 있습니다.</p>
    </section>
    <section class="panel" id="security-orders"><div class="panel-heading"><h2>주식 주문</h2><span id="stock-order-settings" class="muted"></span></div>
        <div class="toolbar"><button type="button" id="stock-order-new" class="primary">매수 / 매도</button><button type="button" id="stock-order-reload">주문 내역 새로고침</button></div>
        <p class="muted">이 화면에서 전송한 최근 200건 · 15건씩 표시합니다. 체결 조회로 KIS 상태를 확인하고, 체결 후 자산 갱신을 실행하면 보유종목에 반영됩니다.</p>
        <div id="stock-order-list"></div>
        <div class="toolbar pagination"><button type="button" id="stock-order-prev">이전</button><span id="stock-order-page" role="status"></span><button type="button" id="stock-order-next">다음</button></div>
    </section>
    <section class="panel" id="security-history"><h2>종목별 당일 등락률 이력</h2>
        <p class="muted">전 거래일 종가 대비 시세일 가격의 변화입니다. 현지 거래일 기준이며 수량·매입가·환율은 반영하지 않습니다. 장중 저장값은 최종 종가와 다를 수 있습니다.</p>
        <div class="toolbar">
            <input type="date" id="daily-price-from" aria-label="등락률 시작일">
            <input type="date" id="daily-price-to" aria-label="등락률 종료일">
            <input id="daily-price-symbol" placeholder="종목명 / 코드 검색" aria-label="등락률 종목 검색">
            <button type="button" id="daily-price-go">조회</button>
        </div>
        <div id="daily-price-history"></div>
        <div class="toolbar pagination"><button type="button" id="daily-price-prev">이전</button><span id="daily-price-page" role="status"></span><button type="button" id="daily-price-next">다음</button></div>
    </section>
    <section class="panel" id="security-trend"><h2>증권 자산 추이</h2>
        <div id="trend-controls"></div>
        <p class="muted">저장된 스냅샷 기준 · 각 지점에 마우스를 올리거나 키보드로 선택하면 날짜와 금액을 볼 수 있습니다.</p>
        <div id="trend"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/account-editor.js'/>?v=20260930-adjust-1"></script>
<script src="<c:url value='/js/pages/securities.js'/>"></script>
<script src="<c:url value='/js/common/stock-orders.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
