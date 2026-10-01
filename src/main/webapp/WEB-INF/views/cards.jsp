<%@ page pageEncoding="UTF-8" %>
<%-- cards 화면 구조. 데이터 조회와 이벤트는 js/pages/cards.js에서 관리한다. --%>
<%@ include file="common/header.jspf" %>
<template id="page-template">
    <section class="panel"><h2>카드</h2>
        <div class="toolbar">
            <button id="new" class="primary">카드 등록</button>
            <button type="button" id="kb-import">KB국민카드 가져오기</button>
            <button type="button" id="reorder">순서 편집</button>
            <input id="search" aria-label="검색" placeholder="이름 검색"><select id="status" aria-label="상태">
            <option value="ACTIVE">사용중</option>
            <option value="ALL">전체 상태</option>
            <option value="CLOSED">해지 / 종료</option>
        </select></div>
        <div id="list"></div>
    </section>
    <section class="panel" id="card-billing"><h2>결제일별 예상 청구 명세</h2>
        <p class="muted">등록된 이용내역과 기존 할부 기준의 예상액입니다. 카드사 확정 청구액과 다를 수 있습니다.</p>
        <div class="toolbar"><label>결제월 <input type="month" id="billing-month"></label><button type="button" id="billing-reload">명세 조회</button><a href="<c:url value='/planned'/>">실제 출금 처리 →</a></div>
        <p id="billing-status" role="status"></p><div id="billing-accounts"></div><div id="billing-cards"></div>
        <p class="muted">기간 미설정 카드는 카드 수정에서 설정하세요. ‘결제월 완료’는 해당 월 출금 처리 상태이며 개별 전표의 실제 청구를 확정하는 뜻은 아닙니다. 휴일·매입 지연·할인·수수료는 별도 확인해주세요.</p>
    </section>
    <section class="panel" aria-labelledby="kb-benefit-title"><h2 id="kb-benefit-title">카드 실적·혜택</h2>
        <p class="muted">실적이 필요한 카드만 관리합니다. 구간별 조건을 한 번 설정하고 매월 KB 실적과 받은 혜택을 동기화하세요.</p>
        <div class="toolbar">
            <label>혜택 기준월 <input type="month" id="kb-benefit-month"></label>
            <button type="button" id="kb-benefit-new" class="primary">관리 카드 추가</button>
        </div>
        <p id="kb-benefit-status" role="status"></p><div id="kb-benefit-board"></div>
    </section>
    <section class="panel"><h2>카드 사용 추이</h2>
        <p class="muted">선택한 월의 직접 입력한 카드 지출입니다. 카드대금 출금은 중복 집계하지 않습니다.</p><input type="month" id="card-chart-month"
                                                                                  aria-label="카드 사용 조회 월">
        <div id="card-chart"></div>
    </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/common/card-editor.js'/>?v=20260930-billing-1"></script>
<script src="<c:url value='/js/common/card-billing.js'/>?v=20261001-review-1"></script>
<script src="<c:url value='/js/common/entry-editor.js'/>"></script>
<script src="<c:url value='/js/common/kb-card-import.js'/>"></script>
<script src="<c:url value='/js/pages/cards.js'/>?v=20260930-billing-1"></script>
<script src="<c:url value='/js/common/kb-benefits.js'/>"></script>
<script src="<c:url value='/js/common/events.js'/>"></script>
</body></html>
