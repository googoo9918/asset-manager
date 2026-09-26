package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.KbBenefitPlan.*;
import com.family.asset.mapper.*;
import java.math.*;
import java.time.YearMonth;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service @RequiredArgsConstructor
public class KbBenefitPlanService {
  private final KbBenefitPlanMapper mapper;
  private final CatalogService catalog;
  private final OperationMapper operations;
  private final KbBrowserService browser;
  private final ObjectMapper json;

  public List<View> list(String month) {
    YearMonth.parse(month);
    return mapper.plans(month).stream().map(p->view(p,mapper.usage(p.cardId(),month),month)).toList();
  }
  @Transactional public PlanView save(Plan plan) {
    catalog.card(plan.cardId());YearMonth.parse(plan.effectiveMonth());
    var thresholds=new HashSet<BigDecimal>();var tierNames=new HashSet<String>();
    for(var tier:plan.tiers()) {
      check(thresholds.add(tier.minimumSpend().stripTrailingZeros()),"실적 구간의 최소 금액이 중복됩니다.");
      check(tierNames.add(tier.name().strip()),"구간 이름이 중복됩니다.");
      var sources=new HashSet<String>();var names=new HashSet<String>();
      for(var benefit:tier.benefits()) {
        check(names.add(benefit.name().strip()),"같은 구간에 혜택 이름이 중복됩니다.");
        for(var source:benefit.sourceNames())check(sources.add(source.strip()+"|"+benefit.unit()),"같은 KB 혜택을 두 항목에 연결할 수 없습니다.");
      }
    }
    operations.lock();
    var old=mapper.exactPlan(plan.cardId(),plan.effectiveMonth());
    check(plan.revision()==(old==null?0:old.revision()),"설정이 변경되었습니다. 다시 열어 확인해주세요.");
    mapper.savePlan(plan.cardId(),plan.effectiveMonth(),json.writeValueAsString(plan));
    return planView(mapper.exactPlan(plan.cardId(),plan.effectiveMonth()));
  }
  public Object start(Sync request) {
    YearMonth.parse(request.month());
    var stored=require(mapper.plan(request.cardId(),request.month()),"카드 실적·혜택 설정");
    var plan=planView(stored).plan();
    return browser.call(Map.of("action","benefits-sync","tracking",Map.of("cardId",request.cardId(),"cardName",plan.sourceCard(),"month",request.month(),"token",UUID.randomUUID().toString())));
  }
  @Transactional public View setTier(SetTier request) {
    YearMonth.parse(request.month());operations.lock();
    var stored=require(mapper.plan(request.cardId(),request.month()),"카드 설정");
    check(stored.month().equals(request.planMonth())&&stored.revision()==request.planRevision(),"구간 설정이 변경되었습니다. 새로고침 후 다시 선택해주세요.");
    var plan=planView(stored).plan();
    check(request.tierName()==null||plan.tiers().stream().anyMatch(t->t.name().equals(request.tierName())),"설정된 구간 중에서 선택해주세요.");
    var old=mapper.tierChoice(request.cardId(),request.month());
    check(request.revision()==(old==null?0:old.revision()),"이번 달 적용 구간이 변경되었습니다. 새로고침 후 다시 선택해주세요.");
    mapper.saveTierChoice(request.cardId(),request.month(),json.writeValueAsString(new TierChoice(plan.sourceCard(),request.tierName())));
    return view(stored,mapper.usage(request.cardId(),request.month()),request.month());
  }
  @Transactional public View apply(String token) {
    var job=json.valueToTree(browser.call(Map.of("action","benefits-status")));
    check("done".equals(job.path("state").asText()),"KB 조회가 아직 완료되지 않았습니다.");
    var result=job.path("result");var tracking=result.path("tracking");
    check(token.equals(tracking.path("token").asText()),"다른 조회 결과입니다. 선택한 카드와 월을 다시 조회해주세요.");
    long cardId=tracking.path("cardId").asLong();String month=tracking.path("month").asText();YearMonth.parse(month);
    var usage=json.treeToValue(result.path("usage"),Usage.class);
    check(month.equals(usage.month()),"조회 기간이 일치하지 않습니다.");
    operations.lock();
    var stored=require(mapper.plan(cardId,month),"카드 설정");
    check(planView(stored).plan().sourceCard().equals(usage.sourceCard()),"조회 중 카드 설정이 변경되었습니다. 다시 조회해주세요.");
    // Each sync replaces the monthly snapshot; repeated syncs never add totals twice.
    mapper.saveUsage(cardId,month,json.writeValueAsString(usage));
    return view(stored,mapper.usage(cardId,month),month);
  }
  PlanView planView(Stored stored){return new PlanView(json.readValue(stored.payload(),Plan.class),stored.revision());}
  static Tier tier(List<Tier> tiers,BigDecimal spend) {
    if(spend==null)return null;
    return tiers.stream().filter(t->t.minimumSpend().compareTo(spend)<=0).max(Comparator.comparing(Tier::minimumSpend)).orElse(null);
  }
  View view(Stored planStored,Stored usageStored,String month) {
    var config=planView(planStored);var plan=config.plan();
    Usage storedUsage=usageStored==null?null:json.readValue(usageStored.payload(),Usage.class);
    Usage usage=storedUsage!=null&&plan.sourceCard().equals(storedUsage.sourceCard())?storedUsage:null;
    var choiceStored=mapper.tierChoice(plan.cardId(),month);
    var choice=choiceStored==null?null:json.readValue(choiceStored.payload(),TierChoice.class);
    boolean manual=choice!=null&&choice.tierName()!=null;
    var applied=manual?(plan.sourceCard().equals(choice.sourceCard())?plan.tiers().stream().filter(t->t.name().equals(choice.tierName())).findFirst().orElse(null):null):tier(plan.tiers(),usage==null?null:usage.previousSpend());
    String tierMode=manual?(applied==null?"REVIEW":"MANUAL"):"AUTO";
    var earned=tier(plan.tiers(),usage==null?null:usage.currentSpend());
    var next=usage==null||usage.currentSpend()==null?null:plan.tiers().stream().filter(t->t.minimumSpend().compareTo(usage.currentSpend())>0).min(Comparator.comparing(Tier::minimumSpend)).orElse(null);
    var items=new ArrayList<BenefitView>();
    if(applied!=null)for(var benefit:applied.benefits()) {
      var names=benefit.sourceNames().stream().map(String::strip).toList();
      BigDecimal used=usage==null?null:usage.received().stream().filter(r->names.contains(r.name().strip())&&benefit.unit().equals(r.unit())).map(Received::value).reduce(BigDecimal.ZERO,BigDecimal::add);
      var remaining=usage!=null&&usage.complete()?benefit.limit().subtract(used).max(BigDecimal.ZERO):null;
      var progress=remaining==null?null:benefit.limit().signum()==0?new BigDecimal("100"):used.multiply(new BigDecimal("100")).divide(benefit.limit(),2,RoundingMode.HALF_UP).min(new BigDecimal("100"));
      items.add(new BenefitView(benefit,used,remaining,progress));
    }
    return new View(config,month,usage,applied,earned,next,next==null?null:next.minimumSpend().subtract(usage.currentSpend()),items,usage==null?null:usageStored.updatedAt(),tierMode,manual?choice.tierName():null,choiceStored==null?0:choiceStored.revision());
  }
}
