<%@ page pageEncoding="UTF-8" %>
<%@ include file="common/header.jspf" %>
<template id="page-template">
 <section class="panel">
  <div class="panel-heading"><div><h2>나의 용돈 기록</h2><p class="muted">기록한 금액만 합산합니다. 실제 계좌 잔액과는 별개이며, 이전 기록의 잔액은 다음 달로 이어집니다.</p></div><a href="<c:url value='/cards'/>">카드 전표 가져오기 →</a></div>
  <div class="toolbar"><label>조회 월 <input type="month" id="allowance-month" required></label><button type="button" id="allowance-plus">+ 금액 추가</button><button type="button" id="allowance-minus">− 사용액 추가</button></div>
  <div id="allowance-summary" class="allowance-summary"></div>
 </section>
 <section class="panel"><div class="panel-heading"><h2>용돈 내역</h2><input type="search" id="allowance-search" placeholder="메모 검색" aria-label="용돈 메모 검색"></div>
  <p id="allowance-status" role="status"></p><div id="allowance-list"></div>
  <div class="toolbar pagination"><button type="button" id="allowance-prev">이전</button><span id="allowance-page" role="status"></span><button type="button" id="allowance-next">다음</button></div>
  <p class="muted">금액 추가는 용돈·환급·보정 등을 +로, 사용액 추가는 −로 기록합니다. 카드 전표는 이용일에 전체 구매액을 반영합니다. 연결한 원거래가 수정되면 따라 바뀌며, 취소되면 합산에서 제외됩니다.</p>
 </section>
</template>
<%@ include file="common/footer.jspf" %>
<script src="<c:url value='/js/pages/allowance.js'/>?v=20261002-allowance-link-1"></script>
<script src="<c:url value='/js/common/events.js'/>?v=20261002-allowance-link-1"></script>
</body></html>
