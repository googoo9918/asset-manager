package com.family.asset.enums;

public enum AssetStatus {
  ACTIVE("사용중"),
  CLOSED("해지");
  private final String label;

  AssetStatus(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
