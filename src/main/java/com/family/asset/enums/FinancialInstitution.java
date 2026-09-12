package com.family.asset.enums;

public enum FinancialInstitution {
  KB("KB국민은행"),
  SHINHAN("신한은행"),
  WOORI("우리은행"),
  HANA("하나은행"),
  NH("NH농협은행"),
  IBK("IBK기업은행"),
  KAKAO("카카오뱅크"),
  TOSS("토스뱅크"),
  KBANK("케이뱅크"),
  SC("SC제일은행"),
  CITI("한국씨티은행"),
  BUSAN("부산은행"),
  DAEGU("iM뱅크"),
  KWANGJU("광주은행"),
  JEONBUK("전북은행"),
  KYONGNAM("경남은행"),
  JEJU("제주은행"),
  SUHYUP("수협은행"),
  POST("우체국"),
  SAEMAUL("새마을금고"),
  CREDIT_UNION("신협"),
  KIS("한국투자증권"),
  MIRAE("미래에셋증권"),
  SAMSUNG("삼성증권"),
  KIWOOM("키움증권"),
  KB_SECURITIES("KB증권"),
  NH_SECURITIES("NH투자증권"),
  CASH("현금"),
  OTHER("기타");
  private final String label;

  FinancialInstitution(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
