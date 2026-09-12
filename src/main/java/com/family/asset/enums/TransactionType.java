package com.family.asset.enums;

public enum TransactionType {
  INCOME("수입"),
  EXPENSE("지출"),
  TRANSFER("자산이동");
  private final String label;

  TransactionType(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
