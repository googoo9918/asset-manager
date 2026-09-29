package com.family.asset.controller;

import com.family.asset.dto.KbImport;
import com.family.asset.dto.KbBenefit;
import com.family.asset.dto.KbBenefitPlan;
import com.family.asset.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.*;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import static com.family.asset.exception.BusinessException.check;

@RestController
@RequestMapping("/api/kb-card")
@RequiredArgsConstructor
public class KbImportController {
  private final KbBrowserService browser;
  private final KbImportService importer;
  private final KbBenefitService benefits;
  private final KbBenefitPlanService benefitPlans;
  // This feature opens a browser on the server PC. Only the local app may invoke it.
  @ModelAttribute
  void localOnly(HttpServletRequest request) throws UnknownHostException {
    check(InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress(), "KB 가져오기는 이 PC에서만 사용할 수 있습니다.");
    String origin = request.getHeader("Origin");
    check(!"cross-site".equals(request.getHeader("Sec-Fetch-Site")), "앱 화면에서 다시 요청해주세요.");
    if (origin != null) {
      URI uri;
      try { uri = URI.create(origin); } catch (Exception e) { throw new com.family.asset.exception.BusinessException("요청 출처를 확인해주세요."); }
      int port = uri.getPort() < 0 ? ("https".equals(uri.getScheme()) ? 443 : 80) : uri.getPort();
      check(request.getScheme().equals(uri.getScheme()) && request.getServerName().equalsIgnoreCase(uri.getHost()) && request.getServerPort() == port, "앱 화면에서 다시 요청해주세요.");
    }
  }
  @PostMapping("/browser") public Object open() { return browser.openExistingChrome(); }
  @PostMapping("/connect") public Object connect() { return browser.call(Map.of("action", "connect")); }
  public record CollectionRequest(String receiptMode) {}
  @PostMapping("/collect") public Object collect(@RequestBody(required=false) CollectionRequest request) {
    String mode=request==null||request.receiptMode()==null?"incremental":request.receiptMode();
    check(java.util.Set.of("incremental","all","none").contains(mode),"전표 수집 방식을 확인해주세요.");
    return browser.call(Map.of("action", "collect","receiptMode",mode));
  }
  @GetMapping("/collection") public Object collection() { return browser.call(Map.of("action", "collection")); }
  @GetMapping("/latest") public Object latest() { return browser.latestCollection(); }
  @PostMapping("/benefits/capture") public Object captureBenefits() { return browser.call(Map.of("action", "benefits")); }
  @GetMapping("/benefits/latest") public Object latestBenefits() { return browser.call(Map.of("action", "benefits-latest")); }
  @GetMapping("/benefits/reports") public Object benefitReports(@RequestParam String month) { return benefits.list(month); }
  @PutMapping("/benefits/reports") public Object saveBenefitReport(@Valid @RequestBody KbBenefit.Report report) { return benefits.save(report); }
  @PostMapping("/benefits/sync") public Object syncBenefits() { return browser.call(Map.of("action", "benefits-sync")); }
  @GetMapping("/benefits/status") public Object benefitStatus() { return browser.call(Map.of("action", "benefits-status")); }
  @GetMapping("/benefits/tracking") public Object tracking(@RequestParam String month) { return benefitPlans.list(month); }
  @PutMapping("/benefits/plans") public Object plan(@Valid @RequestBody KbBenefitPlan.Plan plan) { return benefitPlans.save(plan); }
  @PostMapping("/benefits/tracking/sync") public Object trackingSync(@Valid @RequestBody KbBenefitPlan.Sync request) { return benefitPlans.start(request); }
  @PostMapping("/benefits/tracking/apply") public Object trackingApply(@Valid @RequestBody KbBenefitPlan.Apply request) { return benefitPlans.apply(request.token()); }
  @PutMapping("/benefits/tracking/tier") public Object trackingTier(@Valid @RequestBody KbBenefitPlan.SetTier request) { return benefitPlans.setTier(request); }
  @PostMapping("/automation-browser") public Object openAutomation() { return browser.call(Map.of("action", "open")); }
  @PostMapping("/capture") public Object capture() { return browser.call(Map.of("action", "capture")); }
  @DeleteMapping("/browser") public Object close() { browser.close(); return Map.of("closed", true); }
  @PostMapping("/file") public Object file(@Valid @RequestBody KbImport.File file) {
    return browser.call(Map.of("action", "file", "name", file.name(), "base64", file.base64()));
  }
  @PostMapping("/preview") public Object preview(@Valid @RequestBody KbImport.Preview request) { return importer.preview(request); }
  @GetMapping("/mappings") public Object mappings() { return importer.mappings(); }
  @PutMapping("/mappings") public Object saveMapping(@Valid @RequestBody KbImport.Mapping request) { return importer.saveMapping(request); }
  @PostMapping("/commit") public Object commit(@Valid @RequestBody KbImport.Commit request) { return importer.commit(request); }
}
