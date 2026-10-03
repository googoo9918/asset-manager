<%@ page pageEncoding="UTF-8" %>
<%-- snapshots 화면 구조. 데이터 조회와 이벤트는 js/pages/snapshots.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>자산 스냅샷 추이</h2>
        <div id="trend-controls"></div>
        <p class="muted">저장된 스냅샷 기준 · 각 지점에 마우스를 올리거나 키보드로 선택하면 저장 날짜·시간과 금액을 볼 수 있습니다.</p>
        <div id="trend"></div>
    </section>
    <section class="panel"><h2>시점 비교</h2>
        <div class="toolbar"><select id="snap-before" aria-label="비교 시작 시점"></select><select id="snap-after"
                                                                                             aria-label="비교 종료 시점"></select>
            <button id="compare">비교</button>
        </div>
        <div id="comparison"></div>
    </section>
    <section class="panel"><h2>스냅샷 저장 이력</h2>
        <p class="muted">날짜별 요약은 그날 마지막 저장값입니다. 모든 저장 기록에서는 같은 날 저장한 기록도 각각 확인할 수 있습니다. 날짜와 시각은 한국 시간 기준입니다. 자동 저장은 서버 실행 중 오전 7시에 동작하며, 저장 기록이 없는 날짜는 표시하지 않습니다.</p>
        <div class="toolbar"><label>표시 방식 <select id="snapshot-mode"><option value="all">모든 저장 기록</option><option value="daily">날짜별 요약</option></select></label><label>저장 날짜 <input type="date" id="snapshot-day"></label><button type="button" id="snapshot-clear">전체 날짜</button></div>
        <p id="snapshot-status" role="status"></p><div id="snapshot-list"></div>
        <div class="toolbar pagination"><button type="button" id="snapshot-prev">이전</button><span id="snapshot-page" role="status"></span><button type="button" id="snapshot-next">다음</button></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/snapshots.js'/>?v=20261003-history-1"></script>
<script src="<c:url value='/js/common/events.js'/>?v=20261002-allowance-link-1"></script>
</body></html>
