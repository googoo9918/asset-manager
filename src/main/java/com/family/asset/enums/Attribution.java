package com.family.asset.enums;

public enum Attribution {
  JOINT("공동"),
  HUSBAND("동구"),
  WIFE("윱니");
  private final String label;

  Attribution(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
