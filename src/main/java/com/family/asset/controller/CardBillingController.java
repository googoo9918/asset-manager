package com.family.asset.controller;
import com.family.asset.service.CardBillingService;
import java.time.YearMonth;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/card-billing")
@RequiredArgsConstructor
public class CardBillingController {
  private final CardBillingService billing;
  @GetMapping public Object month(@RequestParam YearMonth month,@RequestParam(defaultValue="JOINT") String owner){return billing.month(month,owner);}
  public record Source(Long entryId) {}
  @PostMapping("/installments/{id}/source") public void link(@PathVariable Long id,@RequestBody Source source){billing.link(id,source.entryId());}
}
