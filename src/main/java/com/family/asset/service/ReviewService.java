package com.family.asset.service;
import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class ReviewService {
 private final EntryMapper entries;
 private final CategoryMapper categories;
 private final CardMapper cards;
 private final AccountMapper accounts;
 private final InstallmentMapper installments;
 private final InstallmentScheduleMapper schedules;
 private final OperationMapper operations;
 public record Item(String id,String version,String type,String title,String description,LocalDate date,
     BigDecimal amount,String action,Long targetId,String href) {}
 public record Result(List<Item> items,Map<String,Long> counts,int total) {}
 public Result list(String owner){return list(owner,OffsetDateTime.now(ZoneId.of("Asia/Seoul")));}
 Result list(String owner,OffsetDateTime now) {
  check(Set.of("JOINT","HUSBAND","WIFE").contains(owner),"소유자 범위를 확인해주세요.");
  var ee=entries.findAll();var cc=cards.findAll();var cats=categories.findAll();var ss=schedules.findAll();
  List<Item> items=new ArrayList<>();
  for(var e:ee) {
   if(Boolean.TRUE.equals(e.getVoided())||e.getTransactionType()==TransactionType.TRANSFER||!(owner.equals("JOINT")||e.getAttribution().name().equals(owner)))continue;
   var category=cats.stream().filter(c->Objects.equals(c.getId(),e.getCategoryId())).findFirst().orElse(null);
   if(category!=null&&!"미분류".equals(category.getName()))continue;
   boolean editable="MANUAL".equals(e.getOrigin());
   items.add(new Item("entry-"+e.getId(),version(e.getUpdatedAt(),e.getCategoryId(),e.getAmount(),e.getMemo()),"CATEGORY",
     e.getMemo()==null||e.getMemo().isBlank()?"분류가 필요한 거래":e.getMemo(),editable?"수입·지출 분류를 선택하면 목록에서 사라집니다.":"자동 등록 거래입니다. 원본 처리 내역에서 분류를 확인해주세요.",
     e.getTransactionDate(),e.getAmount(),editable?"classify":"entry-detail",e.getId(),null));
  }
  for(var c:cc) {
   if(c.getStatus()!=AssetStatus.ACTIVE||c.getCardType()!=CardType.CREDIT||!visible(c.getOwnerCode(),owner))continue;
   if(c.getBillingClosingDay()==null||c.getBillingMonthOffset()==null)
    items.add(new Item("card-"+c.getId(),version(c.getUpdatedAt(),c.getPaymentDay()),"CARD_PERIOD",c.getCardName(),"신용공여기간을 설정해야 이용내역별 예상 청구액을 계산할 수 있습니다.",null,null,"card-edit",c.getId(),null));
  }
  for(var i:installments.findAll()) {
   if(!Boolean.TRUE.equals(i.getActive())||i.getRemainingMonths()==null||i.getRemainingMonths()<=0)continue;
   var c=cc.stream().filter(x->Objects.equals(x.getId(),i.getCardId())).findFirst().orElse(null);
   if(c==null||c.getStatus()!=AssetStatus.ACTIVE||!visible(c.getOwnerCode(),owner))continue;
   var pending=ss.stream().filter(s->Objects.equals(s.getInstallmentId(),i.getId())&&"PENDING".equals(s.getState())).toList();
   if(pending.isEmpty())continue;
   String reason=null;List<Long> candidates=new ArrayList<>();
   if(i.getSourceEntryId()!=null) {
    var source=ee.stream().filter(e->Objects.equals(e.getId(),i.getSourceEntryId())).findFirst().orElse(null);
    if(source==null||!eligible(source,c.getId()))reason="연결한 원거래가 취소·변경되었습니다. 기존 할부의 원거래 연결을 확인해주세요.";
   } else if(c.getBillingClosingDay()!=null&&c.getBillingMonthOffset()!=null) {
    for(var e:ee)if(eligible(e,c.getId())) {
     var first=CardBillingService.firstMonth(c,e.getTransactionDate());
     if(pending.stream().anyMatch(s->{long index=ChronoUnit.MONTHS.between(first,YearMonth.from(s.getDueDate()));return index>=0&&index<e.getInstallmentMonths();}))candidates.add(e.getId());
    }
    if(!candidates.isEmpty())reason="같은 결제월의 할부 구매가 있습니다. 같은 구매라면 원거래를 연결해 이중 합산을 막아주세요. 서로 다른 구매일 수도 있습니다.";
   }
   if(reason!=null){var due=pending.stream().map(InstallmentSchedule::getDueDate).min(Comparator.naturalOrder()).orElseThrow();
    items.add(new Item("installment-"+i.getId(),version(i.getUpdatedAt(),i.getSourceEntryId(),candidates),"INSTALLMENT",c.getCardName()+" · "+Objects.requireNonNullElse(i.getMemo(),"기존 할부"),reason,due,i.getRemainingAmount(),"link",i.getId(),"/cards?billingMonth="+YearMonth.from(due)+"#card-billing"));
   }
  }
  for(var a:accounts.findAll()) {
   if(a.getStatus()!=AssetStatus.ACTIVE||a.getAssetType()!=AssetType.SECURITIES||!Boolean.TRUE.equals(a.getKisLinked())||!visible(a.getOwnerCode(),owner))continue;
   if(a.getLastSyncedAt()==null||a.getLastSyncedAt().isBefore(now.minusDays(7)))
    items.add(new Item("account-"+a.getId(),version(a.getLastSyncedAt()),"SYNC",a.getAccountName(),a.getLastSyncedAt()==null?"연결 계좌를 아직 갱신하지 않았습니다. 자산 갱신으로 잔고를 확인해주세요.":"7일 이상 잔고 갱신이 없습니다. 휴장 여부와 연결 상태를 확인해주세요.",a.getLastSyncedAt()==null?null:a.getLastSyncedAt().atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDate(),null,"link",a.getId(),"/securities#security-accounts"));
  }
  var order=List.of("CARD_PERIOD","INSTALLMENT","CATEGORY","SYNC");
  items.sort(Comparator.comparingInt((Item i)->order.indexOf(i.type())).thenComparing(Item::date,Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(Item::id));
  Map<String,Long> counts=new LinkedHashMap<>();for(String type:order)counts.put(type,items.stream().filter(i->i.type().equals(type)).count());
  return new Result(items,counts,items.size());
 }
 private boolean visible(OwnerCode value,String owner){return owner.equals("JOINT")||value.name().equals(owner);}
 @Transactional
 public void classify(Long id,Long categoryId,Long expectedCategoryId) {
  operations.lock();var entry=require(entries.findById(id),"거래");
  check(!Boolean.TRUE.equals(entry.getVoided())&&"MANUAL".equals(entry.getOrigin())&&entry.getTransactionType()!=TransactionType.TRANSFER,"분류를 변경할 수 없는 거래입니다.");
  var category=require(categories.findById(categoryId),"분류");
  check(Boolean.TRUE.equals(category.getActive())&&category.getTransactionType()==entry.getTransactionType(),"거래 종류에 맞는 사용 중인 분류를 선택해주세요.");
  if(Objects.equals(entry.getCategoryId(),categoryId))return;
  check(Objects.equals(entry.getCategoryId(),expectedCategoryId),"분류가 이미 변경되었습니다. 다시 조회해주세요.");
  operations.categoryChange(id,entry.getCategoryId(),categoryId);
  check(entries.updateCategory(id,categoryId)==1,"거래 상태가 변경되었습니다. 다시 조회해주세요.");
 }
 private boolean eligible(Entry e,Long card){return Objects.equals(e.getCardId(),card)&&!Boolean.TRUE.equals(e.getVoided())&&e.getTransactionType()==TransactionType.EXPENSE&&e.getPaymentMethod()==PaymentMethod.CREDIT&&e.getInstallmentMonths()!=null&&e.getInstallmentMonths()>1;}
 private String version(Object... values){return Integer.toHexString(Arrays.deepHashCode(values));}
}
