<%@ page pageEncoding="UTF-8" %>
<%-- settings 화면 구조. 데이터 조회와 이벤트는 js/pages/settings.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>데이터 백업·복원</h2>
        <p>계좌·거래·자산 추이와 수집한 카드 전표를 함께 백업합니다. 생성한 파일은 다운로드하여 별도 저장장치에도 보관하세요.</p>
        <div class="toolbar"><button type="button" id="backup-create" class="primary" disabled>지금 백업 만들기</button><button type="button" id="backup-reload">목록 새로고침</button></div>
        <p id="backup-status" role="status">백업 상태를 확인하고 있습니다.</p><div id="backup-list"></div>
        <details><summary>백업에 포함되는 내용과 복원 방법</summary>
            <p>DB 전체와 카드 수집 JSON을 포함합니다. API 키·DB 비밀번호·브라우저 인증정보·프로그램 본체는 포함하지 않습니다. 전표 수집이 끝난 뒤 백업해주세요.</p>
            <p>복원 도구와 안내문이 ZIP에 들어 있습니다. 앱을 종료하고 새 DB와 새 폴더에 복원한 뒤 확인합니다. 기존 데이터를 덮어쓰지 않습니다. 복원에는 Python과 PostgreSQL 도구가 필요합니다.</p>
            <p class="muted">백업은 이 PC에 저장되며 자동 백업은 아직 제공하지 않습니다. 금융정보가 포함되므로 본인만 접근할 수 있는 곳에 보관하세요.</p>
        </details>
    </section>
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
<script src="<c:url value='/js/pages/settings.js'/>?v=20260930-backup-1"></script>
<script src="<c:url value='/js/common/events.js'/>?v=20261002-allowance-link-1"></script>
</body></html>
