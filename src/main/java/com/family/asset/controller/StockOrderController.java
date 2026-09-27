package com.family.asset.controller;

import com.family.asset.dto.*;
import com.family.asset.enums.OwnerCode;
import com.family.asset.service.StockOrderService;
import jakarta.validation.Valid;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/securities/orders")
@RequiredArgsConstructor
public class StockOrderController {
  private final StockOrderService service;
  @GetMapping("/settings") public Map<String,Object> settings() {return service.settings();}
  @GetMapping public List<StockOrder> list(@RequestParam(defaultValue="JOINT") OwnerCode owner) {return service.list(owner);}
  @GetMapping("/{id}") public StockOrder find(@PathVariable String id) {return service.find(id);}
  @PostMapping(value="/preview",consumes="application/json") public StockOrder preview(@Valid @RequestBody StockOrderRequest request) {return service.preview(request);}
  @PostMapping(value="/{id}/confirm",consumes="application/json") public StockOrder confirm(@PathVariable String id) {return service.confirm(id);}
  @PostMapping(value="/{id}/sync",consumes="application/json") public StockOrder sync(@PathVariable String id) {return service.sync(id);}
  @PostMapping(value="/{id}/cancel",consumes="application/json") public StockOrder cancel(@PathVariable String id) {return service.cancel(id);}
  public record LinkRequest(String brokerOrderId) {}
  @PostMapping(value="/{id}/link",consumes="application/json") public StockOrder link(@PathVariable String id,@RequestBody LinkRequest request) {return service.link(id,request.brokerOrderId());}
}
