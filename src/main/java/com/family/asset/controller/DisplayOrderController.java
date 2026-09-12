package com.family.asset.controller;

import com.family.asset.dto.DisplayOrderRequest;
import com.family.asset.service.DisplayOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/display-order")
@RequiredArgsConstructor
public class DisplayOrderController {
  private final DisplayOrderService service;

  @PutMapping("/{scope}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void save(@PathVariable String scope, @Valid @RequestBody DisplayOrderRequest request) {
    service.save(scope, request.ids());
  }
}
