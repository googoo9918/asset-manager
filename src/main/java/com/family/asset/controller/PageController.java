package com.family.asset.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/** 화면 URL과 JSP를 명시적으로 연결한다. 각 화면의 JS는 해당 JSP에서만 로드한다. */
@Controller
public class PageController {
  @GetMapping("/allowance") public String allowance(Model model){model.addAttribute("pageTitle","용돈");return "allowance";}
  @GetMapping("/")
  public String dashboard(Model model) {
    model.addAttribute("pageTitle", "대시보드");
    return "dashboard";
  }

  @GetMapping("/assets")
  public String assets(Model model) {
    model.addAttribute("pageTitle", "전체 자산 요약");
    return "assets";
  }

  @GetMapping("/cash")
  public String cash(Model model) {
    model.addAttribute("pageTitle", "현금성 자산");
    return "cash";
  }

  @GetMapping("/savings")
  public String savings(Model model) {
    model.addAttribute("pageTitle", "적금");
    return "savings";
  }

  @GetMapping("/securities")
  public String securities(Model model) {
    model.addAttribute("pageTitle", "증권");
    return "securities";
  }

  @GetMapping("/cards")
  public String cards(Model model) {
    model.addAttribute("pageTitle", "카드");
    return "cards";
  }

  @GetMapping("/loans")
  public String loans(Model model) {
    model.addAttribute("pageTitle", "대출");
    return "loans";
  }

  @GetMapping("/transactions")
  public String transactions(Model model) {
    model.addAttribute("pageTitle", "수입 / 지출");
    return "transactions";
  }

  @GetMapping("/planned")
  public String planned(Model model) {
    model.addAttribute("pageTitle", "예정 거래");
    return "planned";
  }

  @GetMapping("/snapshots")
  public String snapshots(Model model) {
    model.addAttribute("pageTitle", "자산 스냅샷");
    return "snapshots";
  }

  @GetMapping("/settings")
  public String settings(Model model) {
    model.addAttribute("pageTitle", "설정");
    return "settings";
  }

  @GetMapping("/review")
  public String review(Model model) {
    model.addAttribute("pageTitle", "확인할 내역");
    return "review";
  }

}
