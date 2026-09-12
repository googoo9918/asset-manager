package com.family.asset.enums;

public enum RepaymentType {
  EQUAL_PRINCIPAL("원금균등"),
  ANNUITY("원리금균등"),
  BULLET("만기일시상환");
  private final String label;

  RepaymentType(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
