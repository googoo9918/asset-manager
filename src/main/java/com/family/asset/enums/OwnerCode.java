package com.family.asset.enums;

public enum OwnerCode {
  HUSBAND("동구"),
  WIFE("윱니");
  private final String label;

  OwnerCode(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
