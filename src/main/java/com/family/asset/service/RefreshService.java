package com.family.asset.service;

import com.family.asset.enums.*;
import com.family.asset.kis.*;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class RefreshService {
  private final CatalogService catalog;
  private final KisProperties config;
  private final KisClient kis;
  private final SecuritiesService securities;
  private final SnapshotService snapshots;
  private final PlanService plans;
  private final LoanService loans;

  public synchronized Map<String, Object> refresh() {
    List<String> status = new ArrayList<>();
    if (!config.isEnabled()) status.add("KIS 비활성: 저장된 현재 잔액 기준");
    else
      for (var a : catalog.accounts())
        if (a.getKisLinked() && a.getStatus() == AssetStatus.ACTIVE) {
          try {
            var state = kis.fetch(a);
            securities.apply(a.getId(), state);
            status.add(a.getId() + ": 갱신 성공");
          } catch (Exception e) {
            log.warn("KIS refresh failed, accountId={}", a.getId(), e);
            status.add(a.getId() + ": 갱신 실패, 이전 값 유지");
          }
        }
    loans.applyRates();
    return snapshots.capture(status.isEmpty() ? "연동 대상 없음" : String.join(" / ", status));
  }

  @Scheduled(cron = "0 0 7 * * *", zone = "${app.zone:Asia/Seoul}")
  public void daily() {
    try {
      refresh();
    } catch (Exception e) {
      log.error("Daily snapshot failed", e);
    }
  }

  @Scheduled(initialDelay = 10000, fixedDelay = 3600000)
  public void planned() {
    try {
      loans.applyRates();
      plans.generate(YearMonth.now(ZoneId.of("Asia/Seoul")));
      plans.generate(YearMonth.now(ZoneId.of("Asia/Seoul")).plusMonths(1));
    } catch (Exception e) {
      log.error("Planned occurrence generation failed", e);
    }
  }
}
