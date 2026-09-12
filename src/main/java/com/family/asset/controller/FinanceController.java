package com.family.asset.controller;

import com.family.asset.dto.*;
import com.family.asset.service.*;
import jakarta.validation.Valid;
import java.time.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class FinanceController {
  private final LedgerService ledger;
  private final QueryService query;
  private final LoanService loans;
  private final PlanService plans;
  private final SnapshotService snapshots;
  private final RefreshService refresh;

  @GetMapping("/transactions")
  public Object entries(
      @RequestParam(defaultValue = "JOINT") String owner,
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate to,
      @RequestParam(required = false) String type,
      @RequestParam(required = false) Long category,
      @RequestParam(required = false) Long account,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "false") boolean includeVoided) {
    return query.entries(owner, from, to, type, category, account, q, includeVoided);
  }

  @GetMapping("/transactions/{id}")
  public Entry entry(@PathVariable Long id) {
    return ledger.get(id);
  }

  @PostMapping("/transactions/batch")
  @ResponseStatus(HttpStatus.CREATED)
  public Object create(@Valid @RequestBody Commands.Batch r) {
    return ledger.batch(r);
  }

  @PutMapping("/transactions/{id}")
  public Entry update(@PathVariable Long id, @Valid @RequestBody Entry r) {
    return ledger.replace(id, r);
  }

  @DeleteMapping("/transactions/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancel(@PathVariable Long id) {
    ledger.cancel(id);
  }

  @GetMapping("/summary")
  public Object summary(@RequestParam(defaultValue = "JOINT") String owner) {
    return query.summary(owner);
  }

  @GetMapping("/monthly")
  public Object monthly(
      @RequestParam(defaultValue = "JOINT") String owner, @RequestParam String month) {
    return query.monthly(owner, YearMonth.parse(month));
  }

  @GetMapping("/loans/{id}/schedule")
  public Object schedule(@PathVariable Long id, @RequestParam(required = false) LocalDate from) {
    return loans.schedule(id, from == null ? LocalDate.now(ZoneId.of("Asia/Seoul")) : from);
  }

  @PostMapping("/loans/{id}/repayments")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void repay(@PathVariable Long id, @Valid @RequestBody Commands.Repayment r) {
    loans.repay(id, r, null);
  }

  @PostMapping("/loans/{id}/rates")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void rate(@PathVariable Long id, @Valid @RequestBody Commands.Rate r) {
    loans.rate(id, r);
  }

  @GetMapping("/occurrences")
  public Object occurrences(@RequestParam String month) {
    return plans.month(YearMonth.parse(month));
  }

  @PostMapping("/occurrences/{id}/confirm")
  public Object confirm(@PathVariable Long id, @Valid @RequestBody Commands.Confirm r) {
    return plans.confirm(id, r);
  }

  @GetMapping("/occurrences/{id}")
  public Occurrence occurrence(@PathVariable Long id) { return plans.get(id); }

  @DeleteMapping("/occurrences/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancelOccurrence(@PathVariable Long id) {
    plans.cancel(id);
  }

  @PutMapping("/occurrences/{id}/date")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void move(@PathVariable Long id, @RequestParam LocalDate date) {
    plans.move(id, date);
  }

  @PostMapping("/cards/{id}/payments")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void payment(@PathVariable Long id, @Valid @RequestBody Commands.Payment r) {
    plans.payCard(id, r, null);
  }

  @GetMapping("/securities/holdings")
  public Object holdings(
      @RequestParam(required = false) Long account,
      @RequestParam(defaultValue = "JOINT") String owner) {
    return query.holdings(account, owner);
  }

  @GetMapping("/securities/trades")
  public Object trades(@RequestParam(required = false) Long account) {
    return query.trades(account);
  }

  @GetMapping("/securities/portfolio")
  public Object portfolio(@RequestParam(defaultValue = "JOINT") String owner) {
    return query.portfolio(owner);
  }

  @PostMapping("/refresh")
  public Object refresh() {
    return refresh.refresh();
  }

  @GetMapping("/snapshots")
  public Object snapshots(@RequestParam(defaultValue = "JOINT") String owner) {
    return snapshots.list(owner);
  }

  @GetMapping("/snapshots/{id}")
  public Object snapshot(@PathVariable Long id) {
    return snapshots.detail(id);
  }

  @GetMapping("/snapshots/compare")
  public Object compare(
      @RequestParam Long from,
      @RequestParam Long to,
      @RequestParam(defaultValue = "JOINT") String owner) {
    return snapshots.compare(from, to, owner);
  }
}
