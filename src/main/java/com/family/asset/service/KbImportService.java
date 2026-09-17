package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class KbImportService {
  private final CatalogService catalog;
  private final LedgerService ledger;
  private final OperationMapper operations;
  private final KbImportMapper imports;
  private final Map<String, Draft> drafts = new ConcurrentHashMap<>();
  private record Draft(Long cardId, List<KbImport.Row> rows, Instant expires, KbImport.Mapping mapping) {}

  public List<KbImport.Mapping> mappings() { return imports.mappings(); }
  private void validateMapping(KbImport.Mapping mapping) {
    var card = catalog.card(mapping.cardId());
    check(card.getStatus() == AssetStatus.ACTIVE, "사용중인 카드를 선택해주세요.");
    check(Objects.equals(card.getAccountId(), mapping.accountId()), "카드의 연결 자산과 매핑한 자산이 다릅니다.");
    check(catalog.activeAccount(mapping.accountId()).getAssetType() == AssetType.CASH, "현금성 자산을 연결해주세요.");
    check(!mapping.pointPayment() || card.getCardType() == CardType.DEBIT, "포인트리 결제는 포인트 자산에 연결된 체크카드를 선택해주세요.");
  }
  @Transactional
  public KbImport.Mapping saveMapping(KbImport.Mapping mapping) {
    operations.lock();
    validateMapping(mapping);
    var old = imports.mapping(mapping.sourceCard());
    check(old == null || old.equals(mapping), "이미 저장된 카드 연결입니다. 기존 거래와 연결 자산을 확인한 후 변경해주세요.");
    imports.saveMapping(mapping);
    return mapping;
  }

  public KbImport.Result preview(KbImport.Preview request) {
    var card = catalog.card(request.cardId());
    check(card.getStatus() == AssetStatus.ACTIVE, "사용중인 카드를 선택해주세요.");
    drafts.entrySet().removeIf(e -> e.getValue().expires().isBefore(Instant.now()));
    check(drafts.size() < 20, "미리보기가 너무 많습니다. 잠시 후 다시 시도해주세요.");
    var mapping = request.sourceCard() == null ? null : imports.mapping(request.sourceCard());
    if (mapping != null) {
      check(mapping.cardId().equals(card.getId()), "저장된 카드 연결과 선택한 카드가 다릅니다.");
      validateMapping(mapping);
    }
    var draft = new Draft(card.getId(), List.copyOf(request.rows()), Instant.now().plusSeconds(1800), mapping);
    String id = UUID.randomUUID().toString();
    var checked = classify(draft, imports.ready());
    drafts.put(id, draft);
    return new KbImport.Result(id, checked);
  }
  private List<KbImport.Checked> classify(Draft draft, boolean ready) {
    var existing = ledger.list();
    var categories = catalog.categories();
    var seen = new HashSet<String>();
    var cancelledApprovals = new HashSet<String>();
    for (var row : draft.rows()) {
      if ("CANCELLED".equals(row.status()) && row.approvalNumber() != null && !row.approvalNumber().isBlank())
        cancelledApprovals.add(row.approvalNumber().trim());
    }
    var rows = new ArrayList<KbImport.Checked>();
    for (int i=0;i<draft.rows().size();i++) {
      var row = draft.rows().get(i);
      String key = key(row), status = "READY", reason = "저장 가능";
      if (Boolean.TRUE.equals(row.pointPayment()) && (draft.mapping() == null || !draft.mapping().pointPayment() || row.installmentMonths() != 1)) {
        status = "REVIEW"; reason = "포인트리 결제용 카드와 차감할 포인트 자산을 먼저 연결해주세요.";
      } else if (draft.mapping() != null && draft.mapping().pointPayment() && !Boolean.TRUE.equals(row.pointPayment())) {
        status = "REVIEW"; reason = "포인트리 연결에 일반 카드 결제가 포함되어 있습니다.";
      } else if (!"APPROVED".equals(row.status()) || row.amount().signum() <= 0) {
        status = "REVIEW"; reason = "취소·환불·미확인 내역: 원거래 확인 후 거래 화면에서 처리해주세요.";
      } else if (row.approvalNumber() != null && cancelledApprovals.contains(row.approvalNumber().trim())) {
        status = "REVIEW"; reason = "같은 승인번호의 취소 내역이 포함되어 있습니다. 원거래를 확인해주세요.";
      } else if (!seen.add(key) || (ready && imports.find(draft.cardId(), key) != null)) {
        status = "DUPLICATE"; reason = "이미 가져온 내역 또는 파일 안의 중복 내역";
      } else if (existing.stream().anyMatch(e -> Objects.equals(e.getCardId(), draft.cardId())
          && e.getTransactionType() == TransactionType.EXPENSE && !Boolean.TRUE.equals(e.getVoided())
          && e.getTransactionDate().equals(row.date()) && e.getAmount().compareTo(row.amount()) == 0)) {
        status = "REVIEW"; reason = "같은 카드·날짜·금액의 기존 거래가 있습니다. 중복 여부를 직접 확인해주세요.";
      }
      var suggestion=KbCategoryClassifier.suggest(row,categories,imports.categoryRule(
          KbCategoryClassifier.normalize(row.merchant()),KbCategoryClassifier.normalize(row.industry())));
      rows.add(new KbImport.Checked(i, row, status, reason, suggestion.categoryId(), suggestion.reason()));
    }
    return rows;
  }
  @Transactional
  public Map<String, Object> commit(KbImport.Commit request) {
    check(Boolean.TRUE.equals(request.confirmed()), "최종 등록 내용을 확인해주세요.");
    operations.lock();
    var draft = drafts.get(request.previewId());
    check(draft != null && draft.expires().isAfter(Instant.now()), "미리보기가 만료되었습니다. 다시 확인해주세요.");
    check(imports.ready(), "중복 방지 테이블이 필요합니다. db/migrate_kb_card_import.sql을 먼저 적용해주세요.");
    check(new HashSet<>(request.indices()).size() == request.indices().size(), "선택한 행이 중복되었습니다.");
    var checked = classify(draft, true);
    var card = catalog.card(draft.cardId());
    if (draft.mapping() != null) {
      check(draft.mapping().equals(imports.mapping(draft.mapping().sourceCard())), "카드 연결이 변경되었습니다. 다시 확인해주세요.");
      validateMapping(draft.mapping());
    }
    check(card.getStatus() == AssetStatus.ACTIVE, "해지된 카드입니다.");
    var selections=new HashMap<Integer,KbImport.Selection>();
    if(request.selections()!=null)for(var selection:request.selections())
      check(selections.putIfAbsent(selection.index(),selection)==null,"거래별 분류가 중복되었습니다.");
    if(request.selections()!=null)
      check(selections.keySet().equals(new HashSet<>(request.indices())),"선택한 거래와 분류가 일치하지 않습니다.");
    var categories=new HashMap<Integer,Long>();
    var rules=new HashMap<List<String>,Long>();
    // Validate the whole selection before the first write; the transaction also protects against partial imports.
    for (int index : request.indices()) {
      check(index >= 0 && index < checked.size(), "선택한 행을 찾을 수 없습니다.");
      check("READY".equals(checked.get(index).status()), "중복 또는 확인이 필요한 내역이 있습니다. 미리보기를 다시 확인해주세요.");
      check(card.getCardType() != CardType.DEBIT || checked.get(index).row().installmentMonths() == 1, "체크카드 할부 내역을 확인해주세요.");
      var selection=selections.get(index);
      Long category=selection==null?request.categoryId():selection.categoryId();
      check(category!=null,"각 거래의 지출 분류를 선택해주세요.");
      catalog.categoryFor(category, TransactionType.EXPENSE);
      categories.put(index,category);
      if(selection!=null&&selection.remember()){
        var row=checked.get(index).row();
        var ruleKey=List.of(KbCategoryClassifier.normalize(row.merchant()),KbCategoryClassifier.normalize(row.industry()));
        var previous=rules.putIfAbsent(ruleKey,category);
        check(previous==null||previous.equals(category),"같은 가맹점·업종에 서로 다른 분류 규칙을 저장할 수 없습니다.");
      }
    }
    for (int index : request.indices()) {
      var row = checked.get(index).row();
      var entry = new Entry();
      entry.setTransactionDate(row.date()); entry.setTransactionType(TransactionType.EXPENSE);
      entry.setAmount(row.amount()); entry.setAttribution(Attribution.valueOf(card.getOwnerCode().name()));
      entry.setCardId(card.getId()); entry.setPaymentMethod(PaymentMethod.valueOf(card.getCardType().name()));
      entry.setCategoryId(categories.get(index)); entry.setInstallmentMonths(row.installmentMonths());
      entry.setMemo(row.merchant() + (Boolean.TRUE.equals(row.pointPayment()) ? " · 포인트리" : "") + (row.approvalNumber() == null || row.approvalNumber().isBlank() ? "" : " · 승인 " + row.approvalNumber()));
      // Editable through the ordinary transaction UI. Source identities survive edits/cancellations separately.
      var saved = ledger.create(entry, "MANUAL", Boolean.TRUE.equals(row.pointPayment()) || request.affectBalance());
      imports.insert(card.getId(), key(row), saved.getId());
    }
    rules.forEach((rule,category)->imports.saveCategoryRule(rule.get(0),rule.get(1),category));
    return Map.of("imported", request.indices().size());
  }
  static String key(KbImport.Row row) {
    // Approval number + date is stable across exports. Fallback avoids confusing distinct same-day merchants.
    String identity = row.approvalNumber() != null && !row.approvalNumber().isBlank()
        ? row.date() + "|approval|" + row.approvalNumber().trim()
        : row.date() + "|" + row.merchant().strip() + "|" + row.amount().stripTrailingZeros().toPlainString() + "|" + row.installmentMonths();
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8))); }
    catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
}
