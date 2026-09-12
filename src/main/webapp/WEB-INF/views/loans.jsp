<%@ page pageEncoding="UTF-8" %>
<%-- loans 화면 구조. 데이터 조회와 이벤트는 js/pages/loans.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>대출</h2>
        <div class="toolbar">
            <button id="new" class="primary">대출 등록</button>
            <input id="search" aria-label="검색" placeholder="이름 검색"><select id="status" aria-label="상태">
            <option value="ACTIVE">사용중</option>
            <option value="ALL">전체 상태</option>
            <option value="CLOSED">해지 / 종료</option>
        </select></div>
        <div id="list"></div>
    </section>
    <section class="panel"><h2>부채 추이</h2>
        <div id="trend-controls"></div>
        <p class="muted">저장된 스냅샷 기준 · 각 지점에 마우스를 올리거나 키보드로 선택하면 날짜와 금액을 볼 수 있습니다.</p>
        <div id="trend"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/loan-editor.js'/>"></script>
<script src="<c:url value='/js/pages/loans.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
