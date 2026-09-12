<%@ page pageEncoding="UTF-8" %>
<%-- transactions 화면 구조. 데이터 조회와 이벤트는 js/pages/transactions.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>거래내역</h2>
        <div class="toolbar" id="entry-buttons"></div>
        <div class="toolbar"><input type="date" id="from" aria-label="시작일"><input type="date" id="to"
                                                                                  aria-label="종료일"><select id="type"
                                                                                                           aria-label="거래유형"></select><select
                id="category" aria-label="카테고리"></select><input id="query" placeholder="메모 검색"
                                                                aria-label="메모 검색"><label><input type="checkbox"
                                                                                                 id="voided"> 취소
            포함</label>
            <button id="filter">조회</button>
        </div>
        <div id="entries"></div>
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
