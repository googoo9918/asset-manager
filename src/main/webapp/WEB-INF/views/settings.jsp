<%@ page pageEncoding="UTF-8" %>
<%-- settings 화면 구조. 데이터 조회와 이벤트는 js/pages/settings.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>시스템 설정</h2>
        <div id="settings-summary"></div>
        <p>API Key와 DB 비밀번호는 application-local.yml 또는 환경변수에 설정합니다.</p></section>
    <section class="panel"><h2>한국투자증권 연결 상태 및 지원 기능</h2>
        <p>국내·미국 주식 잔고와 시세를 조회합니다. 주문을 활성화하면 증권 화면에서 매수·매도, 체결 조회와 잔량 취소를 이용할 수 있습니다.</p>
        <div id="settings-trading"></div>
        <p class="muted">국내는 지정가·현재가 지정가·시장가, 미국은 지정가·현재가 지정가를 지원합니다. 연결 설정은 증권계좌 수정에서 확인할 수 있습니다.</p>
        <a href="<c:url value='/securities'/>#security-accounts">증권계좌 관리로 이동 →</a>
    </section>
    <section class="panel"><h2>배당·입출금 직접 기록</h2>
        <p>증권사 거래내역을 확인한 뒤 배당금과 입출금을 기록합니다. KIS 자동 조회나 주문 전송 기능이 아닙니다.</p>
        <p class="muted">기록해도 계좌 잔액과 보유 수량은 바뀌지 않습니다. 배당금은 수입 거래에도 반영됩니다.</p>
        <div id="import-button"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/settings.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
