package com.family.asset.exception;

import java.time.OffsetDateTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {
  private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
    return ResponseEntity.status(status)
        .body(
            Map.of(
                "status",
                status.value(),
                "message",
                message,
                "timestamp",
                OffsetDateTime.now().toString()));
  }

  @ExceptionHandler(BusinessException.class)
  public ResponseEntity<?> business(BusinessException e) {
    return error(e.status, e.getMessage());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<?> validation(MethodArgumentNotValidException e) {
    return error(
        HttpStatus.BAD_REQUEST,
        e.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + ": " + f.getDefaultMessage())
            .distinct()
            .reduce((a, b) -> a + " / " + b)
            .orElse("입력값을 확인해주세요."));
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    java.time.DateTimeException.class,
    MethodArgumentTypeMismatchException.class,
    jakarta.validation.ConstraintViolationException.class
  })
  public ResponseEntity<?> format(Exception e) {
    return error(HttpStatus.BAD_REQUEST, "금액·날짜·코드값 형식과 필수 입력값을 확인해주세요.");
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<?> integrity(Exception e) {
    log.warn("DB integrity failure", e);
    return error(HttpStatus.CONFLICT, "중복된 데이터이거나 참조 중인 데이터입니다. 입력값과 연결된 내역을 확인해주세요.");
  }

  @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
  public ResponseEntity<?> contentType(HttpMediaTypeNotSupportedException e) {
    return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "요청의 Content-Type을 application/json으로 지정해주세요.");
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<?> unknown(Exception e) {
    log.error("Request failed", e);
    return error(HttpStatus.INTERNAL_SERVER_ERROR, "처리 중 오류가 발생했습니다. 서버 로그를 확인해주세요.");
  }
}
