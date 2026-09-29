<%@ page pageEncoding="UTF-8" %>
<%-- settings 화면 구조. 데이터 조회와 이벤트는 js/pages/settings.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>시스템 설정</h2>
        <div id="settings-summary"></div>
        <p>API Key와 DB 비밀번호는 application-local.yml 또는 환경변수에 설정합니다.</p></section>
    <section class="panel"><h2>KIS 연동 범위</h2>
        <p>국내·미국 주식 잔고와 시세를 조회합니다. 주문을 활성화하면 증권 화면에서 매수·매도, 체결 조회와 잔량 취소를 이용할 수 있습니다.</p>
        <div id="settings-trading"></div>
        <p class="muted">국내는 지정가·현재가 지정가·시장가, 미국은 지정가·현재가 지정가를 지원합니다. 배당·입출금 내역은 검증된 데이터를 직접 가져옵니다.</p>
        <div id="import-button"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/settings.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
