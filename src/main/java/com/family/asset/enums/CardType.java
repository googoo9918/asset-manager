package com.family.asset.enums;

public enum CardType {
  DEBIT("체크카드"),
  CREDIT("신용카드");
  private final String label;

  CardType(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
