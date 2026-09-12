<%@ page pageEncoding="UTF-8" %>
<%-- settings 화면 구조. 데이터 조회와 이벤트는 js/pages/settings.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>시스템 설정</h2>
        <div id="settings-summary"></div>
        <p>API Key와 DB 비밀번호는 application-local.yml 또는 환경변수에 설정합니다.</p></section>
    <section class="panel"><h2>KIS 연동 범위</h2>
        <p>국내 및 미국주식 잔고를 조회합니다. 배당·입출금 자동 조회는 미구현입니다.</p>
        <div id="import-button"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/settings.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
