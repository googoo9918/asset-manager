package com.family.asset.exception;

import org.springframework.http.HttpStatus;

public class BusinessException extends RuntimeException {
  public final HttpStatus status;

  public BusinessException(String message) {
    this(HttpStatus.BAD_REQUEST, message);
  }

  public BusinessException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  public static <T> T require(T value, String name) {
    if (value == null) throw new BusinessException(HttpStatus.NOT_FOUND, name + "을(를) 찾을 수 없습니다.");
    return value;
  }

  public static void check(boolean condition, String message) {
    if (!condition) throw new BusinessException(message);
  }
}
