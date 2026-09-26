package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.KbBenefit;
import com.family.asset.exception.BusinessException;
import com.family.asset.mapper.*;
import java.math.*;
import java.nio.file.*;
import java.time.YearMonth;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class KbBenefitService {
  private final KbBenefitMapper mapper;
  private final CatalogService catalog;
  private final OperationMapper operations;
  private final ObjectMapper json;
  public List<KbBenefit.View> list(String month) {
    YearMonth.parse(month);
    return mapper.list(month).stream().map(this::view).toList();
  }
  @Transactional
  public KbBenefit.View save(KbBenefit.Report report) {
    check(Boolean.TRUE.equals(report.confirmed()),"카드·기준월·실적 산정월과 혜택 내용을 확인해주세요.");
    var month=YearMonth.parse(report.month());
    var performance=YearMonth.parse(report.performanceMonth());
    check(!performance.isAfter(month),"실적 산정월은 혜택 기준월보다 이후일 수 없습니다.");
    catalog.card(report.cardId());
    var names=new HashSet<String>();
    for(var item:report.benefits())check(names.add(item.name().strip()+"|"+item.unit()),"같은 이름과 단위의 혜택이 중복되었습니다.");
    for(String archive:report.sourceArchives())validateArchive(archive);
    operations.lock();
    var old=mapper.find(report.cardId(),report.month());
    check(report.revision()==(old==null?0:old.revision()),"다른 화면에서 기록이 변경되었습니다. 닫고 다시 열어 확인해주세요.");
    mapper.save(report.cardId(),report.month(),json.writeValueAsString(report));
    return view(mapper.find(report.cardId(),report.month()));
  }
  private void validateArchive(String name) {
    check(name.matches("benefits-[0-9]+-[a-f0-9-]+\\.json"),"실적·혜택 원본 파일명을 확인해주세요.");
    Path file=Path.of("data/kb-card/benefits").resolve(name);
    try {
      check(Files.isRegularFile(file)&&Files.size(file)<=5*1024*1024,"실적·혜택 원본 파일을 찾을 수 없습니다.");
      check("asset-manager-kb-benefits".equals(json.readTree(Files.readString(file)).path("format").asText()),"실적·혜택 원본 형식을 확인해주세요.");
    }catch(java.io.IOException e){throw new BusinessException("실적·혜택 원본을 읽지 못했습니다.");}
  }
  static BigDecimal remaining(BigDecimal target,BigDecimal actual) {
    return target==null||actual==null?null:target.subtract(actual).max(BigDecimal.ZERO);
  }
  KbBenefit.View view(KbBenefit.Stored stored) {
    var report=json.readValue(stored.payload(),KbBenefit.Report.class);
    var remaining=remaining(report.targetSpend(),report.recognizedSpend());
    BigDecimal progress=remaining==null?null:report.targetSpend().signum()==0?new BigDecimal("100"):
        report.recognizedSpend().multiply(new BigDecimal("100")).divide(report.targetSpend(),2,RoundingMode.HALF_UP).min(new BigDecimal("100"));
    return new KbBenefit.View(report,stored.revision(),stored.updatedAt(),remaining,progress,
        report.benefits().stream().map(item->new KbBenefit.ItemView(item,remaining(item.limit(),item.used()))).toList(),
        report.sourceArchives().isEmpty()?"MANUAL":"KB_REVIEWED");
  }
}
