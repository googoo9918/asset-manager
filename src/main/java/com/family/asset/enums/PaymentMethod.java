package com.family.asset.enums;

public enum PaymentMethod {
  ACCOUNT("계좌/현금"),
  DEBIT("체크카드"),
  CREDIT("신용카드");
  private final String label;

  PaymentMethod(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
