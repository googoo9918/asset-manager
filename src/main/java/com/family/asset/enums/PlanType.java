package com.family.asset.enums;

public enum PlanType {
  EXPENSE("반복 지출"),
  CARD_PAYMENT("카드대금"),
  SAVINGS("적금 납입"),
  LOAN("대출 상환");
  private final String label;

  PlanType(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
