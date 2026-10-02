<%@ page pageEncoding="UTF-8" %>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel">
        <div class="panel-heading"><div><h2>하나씩 확인하고 정리하세요</h2><p class="muted">분류·설정을 수정하면 다음 조회에서 자동으로 사라집니다. 확인만으로 거래나 잔액을 바꾸지 않습니다.</p></div><button type="button" id="review-reload">다시 확인</button></div>
        <div id="review-types" class="review-types" role="group" aria-label="확인 항목 종류"></div>
        <div class="toolbar"><input type="search" id="review-search" aria-label="확인할 내역 검색" placeholder="거래 메모·카드·계좌 검색"><label><input type="checkbox" id="review-deferred">나중에 보기 포함</label></div>
        <p id="review-status" role="status">확인할 내역을 불러오고 있습니다.</p>
        <div id="review-list"></div>
        <div class="toolbar pagination"><button type="button" id="review-prev">이전</button><span id="review-page" role="status"></span><button type="button" id="review-next">다음</button></div>
        <p class="muted">‘하루 뒤에 보기’는 이 브라우저에만 저장합니다. 내용이 바뀌면 다시 표시합니다. 할부 연결 항목은 중복 확정이 아닌 검토 대상이며, 잔고 갱신은 7일 기준입니다.</p>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/card-editor.js'/>?v=20261001-period-2"></script>
<script src="<c:url value='/js/pages/review.js'/>?v=20260930-review-1"></script>
<script src="<c:url value='/js/common/events.js'/>?v=20261002-allowance-link-1"></script>
</body></html>
