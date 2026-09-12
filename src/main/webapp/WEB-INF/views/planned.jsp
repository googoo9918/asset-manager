<%@ page pageEncoding="UTF-8" %>
<%-- planned 화면 구조. 데이터 조회와 이벤트는 js/pages/planned.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>예정 거래</h2>
        <div class="toolbar">
            <button id="prev">이전 달</button>
            <input type="month" id="calendar-month" aria-label="조회 월">
            <button id="next">다음 달</button>
            <button id="new-plan" class="primary">반복 지출 등록</button>
        </div>
        <div class="calendar-wrap">
            <div class="calendar" id="calendar"></div>
        </div>
    </section>
    <section class="panel"><h2>등록한 반복 지출</h2>
        <div id="plan-list"></div>
    </section>
    <section class="panel"><h2>예정 금액 분포</h2>
        <p class="muted">미처리 예정금액입니다. 카드 예정에는 등록한 기존 할부 회차만 포함되며, 일반 카드 사용액을 포함한 총 청구액은 납부 시 확인합니다.</p>
        <div id="planned-chart"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/entry-editor.js'/>"></script>
<script src="<c:url value='/js/common/card-editor.js'/>"></script>
<script src="<c:url value='/js/common/loan-editor.js'/>"></script>
<script src="<c:url value='/js/pages/planned.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
