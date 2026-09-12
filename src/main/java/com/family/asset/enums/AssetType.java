package com.family.asset.enums;

public enum AssetType {
  CASH("현금성 자산"),
  SAVINGS("적금"),
  SECURITIES("증권");
  private final String label;

  AssetType(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
