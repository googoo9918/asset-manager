package com.family.asset.controller;

import com.family.asset.dto.SecurityTrade;
import com.family.asset.kis.*;
import com.family.asset.service.SecuritiesService;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SettingsController {
  private final KisProperties config;
  private final SecuritiesService securities;

  @GetMapping("/settings")
  public Object settings() {
    return Map.of(
        "kisEnabled",
        config.isEnabled(),
        "baseUrl",
        config.getBaseUrl(),
        "credentialConfigured",
        !config.getAppKey().isBlank() && !config.getAppSecret().isBlank(),
        "configuredAccountIds",
        config.getAccounts().keySet(),
        "zone",
        "Asia/Seoul",
        "snapshotTime",
        "07:00",
        "dividendAutoFetch",
        false);
  }

  @PostMapping("/securities/{id}/trades/import")
  public Object importTrades(@PathVariable Long id, @RequestBody List<SecurityTrade> rows) {
    com.family.asset.exception.BusinessException.check(
        rows != null && rows.size() <= 1000, "한 번에 최대 1000건까지 처리할 수 있습니다.");
    securities.importTrades(id, rows);
    return Map.of("message", "중복 식별자를 제외한 거래를 반영했습니다.");
  }
}
