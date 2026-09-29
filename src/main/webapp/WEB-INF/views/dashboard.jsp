<%@ page pageEncoding="UTF-8" %>
<%-- dashboard 화면 구조. 데이터 조회와 이벤트는 js/pages/dashboard.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <div id="dashboard-metrics"></div>
    <div class="quick-links" aria-label="자주 쓰는 화면">
        <a href="<c:url value='/transactions'/>">수입·지출 기록</a><a href="<c:url value='/planned'/>">예정 출금 확인</a><a href="<c:url value='/securities'/>">보유 종목 확인</a><a href="<c:url value='/snapshots'/>">자산 변동 비교</a>
    </div>
    <div class="columns">
        <section class="panel"><h2>현재 자산 구성</h2>
            <div id="asset-composition"></div>
        </section>
        <section class="panel"><h2>이번 달 수입 / 지출</h2>
            <div id="monthly-overview"></div>
        </section>
    </div>
    <section class="panel"><h2>자산 추이</h2>
        <div id="trend-controls"></div>
        <p class="muted">저장된 스냅샷 기준 · 각 지점에 마우스를 올리거나 키보드로 선택하면 날짜와 금액을 볼 수 있습니다.</p>
        <div id="trend"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/dashboard.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
