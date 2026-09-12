package com.family.asset.enums;

public enum RepeatCycle {
  ONCE("1회"),
  WEEKLY("매주"),
  MONTHLY("매월"),
  YEARLY("매년");
  private final String label;

  RepeatCycle(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }
}
