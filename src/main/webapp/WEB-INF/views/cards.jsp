<%@ page pageEncoding="UTF-8" %>
<%-- cards 화면 구조. 데이터 조회와 이벤트는 js/pages/cards.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>카드</h2>
        <div class="toolbar">
            <button id="new" class="primary">카드 등록</button>
            <button type="button" id="reorder">순서 편집</button>
            <input id="search" aria-label="검색" placeholder="이름 검색"><select id="status" aria-label="상태">
            <option value="ACTIVE">사용중</option>
            <option value="ALL">전체 상태</option>
            <option value="CLOSED">해지 / 종료</option>
        </select></div>
        <div id="list"></div>
    </section>
    <section class="panel"><h2>카드 사용 추이</h2>
        <p class="muted">선택한 월의 직접 입력한 카드 지출입니다. 카드대금 출금은 중복 집계하지 않습니다.</p><input type="month" id="card-chart-month"
                                                                                  aria-label="카드 사용 조회 월">
        <div id="card-chart"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/card-editor.js'/>"></script>
<script src="<c:url value='/js/common/entry-editor.js'/>"></script>
<script src="<c:url value='/js/pages/cards.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
