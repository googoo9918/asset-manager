package com.family.asset.controller;

import com.family.asset.dto.*;
import com.family.asset.service.*;
import jakarta.validation.Valid;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CatalogController {
  private final CatalogService service;
  private final InstallmentService installmentService;

  @GetMapping("/installment-schedules")
  public Object installmentSchedules() { return installmentService.list(); }

  @GetMapping("/accounts")
  public List<Account> accounts() {
    return service.accounts();
  }

  @GetMapping("/accounts/{id}")
  public Account getAccount(@PathVariable Long id) {
    return com.family.asset.exception.BusinessException.require(
        service.accounts().stream().filter(x -> x.getId().equals(id)).findFirst().orElse(null),
        "데이터");
  }

  @PostMapping("/accounts")
  @ResponseStatus(HttpStatus.CREATED)
  public Account createAccount(@Valid @RequestBody Account r) {
    return service.saveAccount(null, r);
  }

  @PutMapping("/accounts/{id}")
  public Account updateAccount(@PathVariable Long id, @Valid @RequestBody Account r) {
    return service.saveAccount(id, r);
  }

  @DeleteMapping("/accounts/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteAccount(@PathVariable Long id) {
    service.closeAccount(id);
  }

  @GetMapping("/cards")
  public List<Card> cards() {
    return service.cards();
  }

  @GetMapping("/cards/{id}")
  public Card getCard(@PathVariable Long id) {
    return com.family.asset.exception.BusinessException.require(
        service.cards().stream().filter(x -> x.getId().equals(id)).findFirst().orElse(null), "데이터");
  }

  @PostMapping("/cards")
  @ResponseStatus(HttpStatus.CREATED)
  public Card createCard(@Valid @RequestBody Card r) {
    return service.saveCard(null, r);
  }

  @PutMapping("/cards/{id}")
  public Card updateCard(@PathVariable Long id, @Valid @RequestBody Card r) {
    return service.saveCard(id, r);
  }

  @DeleteMapping("/cards/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteCard(@PathVariable Long id) {
    service.closeCard(id);
  }

  @GetMapping("/loans")
  public List<Loan> loans() {
    return service.loans();
  }

  @GetMapping("/loans/{id}")
  public Loan getLoan(@PathVariable Long id) {
    return com.family.asset.exception.BusinessException.require(
        service.loans().stream().filter(x -> x.getId().equals(id)).findFirst().orElse(null), "데이터");
  }

  @PostMapping("/loans")
  @ResponseStatus(HttpStatus.CREATED)
  public Loan createLoan(@Valid @RequestBody Loan r) {
    return service.saveLoan(null, r);
  }

  @PutMapping("/loans/{id}")
  public Loan updateLoan(@PathVariable Long id, @Valid @RequestBody Loan r) {
    return service.saveLoan(id, r);
  }

  @DeleteMapping("/loans/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteLoan(@PathVariable Long id) {
    service.closeLoan(id);
  }

  @GetMapping("/categories")
  public List<Category> categories() {
    return service.categories();
  }

  @GetMapping("/categories/{id}")
  public Category getCategory(@PathVariable Long id) {
    return com.family.asset.exception.BusinessException.require(
        service.categories().stream().filter(x -> x.getId().equals(id)).findFirst().orElse(null),
        "데이터");
  }

  @PostMapping("/categories")
  @ResponseStatus(HttpStatus.CREATED)
  public Category createCategory(@Valid @RequestBody Category r) {
    return service.saveCategory(null, r);
  }

  @PutMapping("/categories/{id}")
  public Category updateCategory(@PathVariable Long id, @Valid @RequestBody Category r) {
    return service.saveCategory(id, r);
  }

  @DeleteMapping("/categories/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteCategory(@PathVariable Long id) {
    service.deactivateCategory(id);
  }

  @GetMapping("/plans")
  public List<Plan> plans() {
    return service.plans();
  }

  @GetMapping("/plans/{id}")
  public Plan getPlan(@PathVariable Long id) {
    return com.family.asset.exception.BusinessException.require(
        service.plans().stream().filter(x -> x.getId().equals(id)).findFirst().orElse(null), "데이터");
  }

  @PostMapping("/plans")
  @ResponseStatus(HttpStatus.CREATED)
  public Plan createPlan(@Valid @RequestBody Plan r) {
    return service.savePlan(null, r);
  }

  @PutMapping("/plans/{id}")
  public Plan updatePlan(@PathVariable Long id, @Valid @RequestBody Plan r) {
    return service.savePlan(id, r);
  }

  @DeleteMapping("/plans/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deletePlan(@PathVariable Long id) {
    service.deactivatePlan(id);
  }

  @GetMapping("/installments")
  public List<Installment> installments() {
    return service.installments();
  }

  @GetMapping("/installments/{id}")
  public Installment getInstallment(@PathVariable Long id) {
    return com.family.asset.exception.BusinessException.require(
        service.installments().stream().filter(x -> x.getId().equals(id)).findFirst().orElse(null),
        "데이터");
  }

  @PostMapping("/installments")
  @ResponseStatus(HttpStatus.CREATED)
  public Installment createInstallment(@Valid @RequestBody Installment r) {
    return service.saveInstallment(null, r);
  }

  @PutMapping("/installments/{id}")
  public Installment updateInstallment(@PathVariable Long id, @Valid @RequestBody Installment r) {
    return service.saveInstallment(id, r);
  }

  @DeleteMapping("/installments/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteInstallment(@PathVariable Long id) {
    service.deactivateInstallment(id);
  }

  @PostMapping("/accounts/{id}/adjustments")
  public Account adjust(@PathVariable Long id, @Valid @RequestBody Commands.Adjustment r) {
    return service.adjust(id, r);
  }

  @GetMapping("/accounts/{id}/adjustments")
  public Object adjustments(@PathVariable Long id) {
    service.account(id);
    return service.adjustments(id);
  }

  @GetMapping("/cards/{id}/payments")
  public Object payments(@PathVariable Long id) {
    service.card(id);
    return service.cardPayments(id);
  }

  @GetMapping("/loans/{id}/repayments")
  public Object repayments(@PathVariable Long id) {
    service.loan(id);
    return service.repayments(id);
  }

  @GetMapping("/loans/{id}/rates")
  public Object rates(@PathVariable Long id) {
    service.loan(id);
    return service.rates(id);
  }
}
