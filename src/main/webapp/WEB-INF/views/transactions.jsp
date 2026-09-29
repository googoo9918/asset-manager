<%@ page pageEncoding="UTF-8" %>
<%-- transactions 화면 구조. 데이터 조회와 이벤트는 js/pages/transactions.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>거래내역</h2>
        <div class="toolbar" id="entry-buttons"></div>
        <div class="filter-presets" aria-label="빠른 기간 선택"><button type="button" id="entries-this-month">이번 달</button><button type="button" id="entries-last-month">지난달</button><button type="button" id="entries-three-months">최근 3개월</button></div>
        <div class="filter-grid">
            <label>시작일<input type="date" id="from" aria-label="시작일" required></label>
            <label>종료일<input type="date" id="to" aria-label="종료일" required></label>
            <label>거래 유형<select id="type" aria-label="거래유형"></select></label>
            <label>카테고리<select id="category" aria-label="카테고리"></select></label>
            <label class="filter-search">메모 검색<input id="query" placeholder="찾고 싶은 거래의 메모" aria-label="메모 검색" type="search"></label>
        </div>
        <div class="filter-actions"><label><input type="checkbox" id="voided"> 취소 내역 포함</label><button type="button" id="entries-reset">조건 초기화</button><button type="button" id="filter" class="primary">조회</button></div>
        <p id="entry-filter-error" class="filter-message" role="alert"></p>
        <p id="entry-filter-summary" class="muted" role="status"></p>
        <div id="entries"></div>
        <nav class="toolbar pagination" aria-label="거래 내역 페이지">
            <button type="button" id="entries-first">처음</button>
            <button type="button" id="entries-prev">이전</button>
            <span id="entries-page" role="status" aria-live="polite"></span>
            <button type="button" id="entries-next">다음</button>
            <button type="button" id="entries-last">마지막</button>
        </nav>
    </section>
    <section class="panel"><h2>조회 기간 수입 / 지출 추이</h2>
        <div id="income-chart"></div>
        <div id="expense-chart"></div>
    </section>
    <section class="panel"><h2>이번 달 상세 분석</h2>
        <div id="analysis"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/entry-editor.js'/>"></script>
<script src="<c:url value='/js/pages/transactions.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
