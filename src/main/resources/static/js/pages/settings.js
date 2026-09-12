// pages/settings.js — 현재 화면의 조회/렌더링. 공통 코드 변경 없이 이 파일에서 관리합니다.
async function settings() {
  const s = await api("/settings");
  pageTemplate();
  $("#settings-summary").innerHTML=detailGrid({"KIS 연동":s.kisEnabled?"사용":"사용 안 함","공통 인증정보":s.credentialConfigured?"설정됨":"미설정 (개별 설정 사용 가능)","개별 인증 계좌":s.configuredAccountIds.join(", ")||"없음","기준 시간대":s.zone,"자동 스냅샷":s.snapshotTime+" (앱 실행 중)","API 주소":s.baseUrl});
  $("#import-button").append(
    button("증권 거래 데이터 가져오기", () =>
      modal(
        "검증된 증권 거래 가져오기",
        `<div class="fields">${select(
          "accountId",
          "증권계좌",
          '<option value="">선택</option>' +
            state.accounts
              .filter(
                (a) => a.assetType === "SECURITIES" && a.status === "ACTIVE",
              )
              .map(
                (a) => `<option value="${a.id}">${esc(a.accountName)}</option>`,
              )
              .join(""),
        )}<label class="field full">거래 JSON<textarea name="rows" rows="12" required placeholder='[{"externalId":"고유번호","tradeDate":"2026-09-07","tradeType":"DIVIDEND","symbol":"VOO","currencyCode":"USD","quantity":"0","amount":"10","exchangeRate":"1350"}]'></textarea></label></div>`,
        () => {
          const r = formData($("#modal-body"));
          return api(
            "/securities/" + r.accountId + "/trades/import",
            "POST",
            JSON.parse(r.rows),
          );
        },
      ),
    ),
  );
}

async function renderPage() { await settings(); }
