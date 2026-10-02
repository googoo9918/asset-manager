<%@ page pageEncoding="UTF-8" %>
<%-- snapshots 화면 구조. 데이터 조회와 이벤트는 js/pages/snapshots.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>자산 스냅샷 추이</h2>
        <div id="trend-controls"></div>
        <p class="muted">저장된 스냅샷 기준 · 각 지점에 마우스를 올리거나 키보드로 선택하면 날짜와 금액을 볼 수 있습니다.</p>
        <div id="trend"></div>
    </section>
    <section class="panel"><h2>시점 비교</h2>
        <div class="toolbar"><select id="snap-before" aria-label="비교 시작 시점"></select><select id="snap-after"
                                                                                             aria-label="비교 종료 시점"></select>
            <button id="compare">비교</button>
        </div>
        <div id="comparison"></div>
    </section>
    <section class="panel"><h2>전체 저장 이력</h2>
        <div id="snapshot-list"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/snapshots.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>?v=20261002-allowance-link-1"></script>
</body></html>
