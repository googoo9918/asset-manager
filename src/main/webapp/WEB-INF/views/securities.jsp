<%@ page pageEncoding="UTF-8" %>
<%-- securities 화면 구조. 데이터 조회와 이벤트는 js/pages/securities.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>증권계좌</h2>
        <div class="toolbar">
            <button id="new-security" class="primary">증권계좌 등록</button>
            <button type="button" id="reorder">순서 편집</button>
            <input id="security-search" placeholder="계좌명 검색" aria-label="계좌명 검색"></div>
        <p class="muted">원화와 달러를 함께 표시합니다. 환산액은 각 계좌에 저장된 환율 기준이며 실제 달러 보유액과 구분됩니다.</p>
        <div id="security-list"></div>
    </section>
    <section class="panel"><h2>통합 포트폴리오 · 예수금 포함</h2>
        <div class="toolbar">
            <div id="portfolio-layout" class="segmented" role="group" aria-label="포트폴리오 형태">
                <button type="button" data-layout="bar">막대</button>
                <button type="button" data-layout="pie">원형</button>
            </div>
            <label>정렬 기준 <select id="portfolio-sort-metric">
                <option value="value">평가금액 (KRW)</option>
                <option value="profit">평가손익 (KRW)</option>
                <option value="return">수익률 (환율 제외)</option>
            </select></label>
            <label>정렬 방향 <select id="portfolio-sort">
                <option value="desc">높은 순</option>
                <option value="asc">낮은 순</option>
            </select></label></div>
        <div id="portfolio-chart"></div>
        <p class="muted">통합 평단가는 수량 가중평균입니다. 수익률은 환율 손익을 제외합니다.</p>
        <div id="portfolio-table"></div>
    </section>
    <section class="panel"><h2>종목별 당일 등락률 이력</h2>
        <p class="muted">전 거래일 종가 대비 시세일 가격의 변화입니다. 현지 거래일 기준이며 수량·매입가·환율은 반영하지 않습니다. 장중 저장값은 최종 종가와 다를 수 있습니다.</p>
        <div class="toolbar">
            <input type="date" id="daily-price-from" aria-label="등락률 시작일">
            <input type="date" id="daily-price-to" aria-label="등락률 종료일">
            <input id="daily-price-symbol" placeholder="종목명 / 코드 검색" aria-label="등락률 종목 검색">
            <button type="button" id="daily-price-go">조회</button>
        </div>
        <div id="daily-price-history"></div>
        <div class="toolbar"><button type="button" id="daily-price-prev">이전</button><span id="daily-price-page" role="status"></span><button type="button" id="daily-price-next">다음</button></div>
    </section>
    <section class="panel"><h2>증권 자산 추이</h2>
        <div id="trend-controls"></div>
        <p class="muted">저장된 스냅샷 기준 · 각 지점에 마우스를 올리거나 키보드로 선택하면 날짜와 금액을 볼 수 있습니다.</p>
        <div id="trend"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/account-editor.js'/>"></script>
<script src="<c:url value='/js/pages/securities.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
