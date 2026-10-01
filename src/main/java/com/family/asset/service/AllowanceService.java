package com.family.asset.service;
import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
import com.family.asset.enums.TransactionType;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class AllowanceService {
 private final AllowanceMapper records;
 private final EntryMapper entries;
 private final OperationMapper operations;
 public record Item(Long id,String ownerCode,LocalDate date,BigDecimal amount,String memo,Long sourceEntryId,Long currentEntryId,boolean sourceCancelled) {}
 public record Summary(String ownerCode,BigDecimal opening,BigDecimal added,BigDecimal used,BigDecimal balance) {}
 public record Result(List<Item> items,List<Summary> summaries) {}
 public static void owner(String owner){check("HUSBAND".equals(owner)||"WIFE".equals(owner),"용돈을 기록할 사람을 선택해주세요.");}
 private Map<Long,Entry> replacements(List<Entry> all){Map<Long,Entry> result=new HashMap<>();for(var e:all)if(e.getReplacesId()!=null){var old=result.get(e.getReplacesId());if(old==null||e.getId()>old.getId())result.put(e.getReplacesId(),e);}return result;}
 private Entry current(Entry first,Map<Long,Entry> replacements){var seen=new HashSet<Long>();while(first!=null&&seen.add(first.getId())&&replacements.containsKey(first.getId()))first=replacements.get(first.getId());return first;}
 private boolean valid(Entry e){return e!=null&&!Boolean.TRUE.equals(e.getVoided())&&e.getTransactionType()==TransactionType.EXPENSE&&e.getAmount()!=null&&e.getAmount().signum()>0;}
 public Result list(YearMonth month,String owner){
  check(Set.of("JOINT","HUSBAND","WIFE").contains(owner),"조회할 사람을 선택해주세요.");
  var all=entries.findAll();var replacements=replacements(all);Map<Long,Entry> indexed=new HashMap<>();all.forEach(e->indexed.put(e.getId(),e));
  List<Item> items=new ArrayList<>();
  for(var r:records.all()){
   if(!owner.equals("JOINT")&&!owner.equals(r.getOwnerCode()))continue;
   var e=r.getSourceEntryId()==null?null:current(indexed.get(r.getSourceEntryId()),replacements);
   boolean cancelled=r.getSourceEntryId()!=null&&!valid(e);
   items.add(new Item(r.getId(),r.getOwnerCode(),e==null?r.getRecordDate():e.getTransactionDate(),r.getSourceEntryId()==null?r.getAmount():cancelled?BigDecimal.ZERO:e.getAmount().negate(),e==null?r.getMemo():e.getMemo(),r.getSourceEntryId(),e==null?null:e.getId(),cancelled));
  }
  List<Summary> totals=new ArrayList<>();
  for(String person:List.of("HUSBAND","WIFE"))if(owner.equals("JOINT")||owner.equals(person)){
   BigDecimal opening=BigDecimal.ZERO,added=BigDecimal.ZERO,used=BigDecimal.ZERO;
   for(var item:items)if(item.ownerCode().equals(person)){
    if(item.date().isBefore(month.atDay(1)))opening=opening.add(item.amount());
    else if(item.date().isBefore(month.plusMonths(1).atDay(1))){if(item.amount().signum()>0)added=added.add(item.amount());else used=used.subtract(item.amount());}
   }
   totals.add(new Summary(person,opening,added,used,opening.add(added).subtract(used)));
  }
  return new Result(items.stream().filter(i->YearMonth.from(i.date()).equals(month)).sorted(Comparator.comparing(Item::date).reversed().thenComparing(Item::id,Comparator.reverseOrder())).toList(),totals);
 }
 @Transactional public AllowanceRecord manual(Long id,AllowanceRecord value){
  operations.lock();owner(value.getOwnerCode());check(value.getRecordDate()!=null,"날짜를 입력해주세요.");
  check(value.getAmount()!=null&&value.getAmount().signum()!=0&&value.getAmount().scale()<=2&&value.getAmount().precision()-value.getAmount().scale()<=22,"금액은 0이 아닌 소수 둘째 자리 이내로 입력해주세요.");
  check(value.getMemo()!=null&&value.getMemo().length()<=300,"메모는 300자 이내로 입력해주세요.");
  value.setSourceEntryId(null);value.setActive(true);
  if(id==null){
   try{UUID.fromString(value.getRequestId());}catch(Exception e){throw new com.family.asset.exception.BusinessException("등록 요청을 다시 열어주세요.");}
   var old=records.request(value.getRequestId());
   if(old!=null){check(Boolean.TRUE.equals(old.getActive())&&old.getOwnerCode().equals(value.getOwnerCode())&&old.getRecordDate().equals(value.getRecordDate())&&old.getAmount().compareTo(value.getAmount())==0&&old.getMemo().equals(value.getMemo()),"이미 처리된 요청입니다. 내역을 확인해주세요.");return old;}
   value.setId(null);records.insert(value);
  }else{var old=require(records.find(id),"용돈 내역");check(old.getSourceEntryId()==null&&Boolean.TRUE.equals(old.getActive()),"직접 입력한 내역만 수정할 수 있습니다.");value.setId(id);check(records.update(value)==1,"내역이 변경되었습니다. 다시 조회해주세요.");}
  return records.find(value.getId());
 }
 @Transactional public void assign(Long sourceId,String owner){
  operations.lock();check(records.imported(sourceId),"가져온 카드 전표만 연결할 수 있습니다.");
  var existing=records.source(sourceId);
  if(owner==null||owner.isBlank()){if(existing!=null)records.remove(existing.getId());return;}
  owner(owner);var all=entries.findAll();var source=entries.findById(sourceId);var latest=current(source,replacements(all));
  check(valid(latest),"취소되었거나 지출이 아닌 원거래는 연결할 수 없습니다.");
  var value=new AllowanceRecord();value.setOwnerCode(owner);value.setSourceEntryId(sourceId);value.setRecordDate(latest.getTransactionDate());value.setAmount(latest.getAmount().negate());var memo=Objects.requireNonNullElse(latest.getMemo(),"카드 사용");value.setMemo(memo.substring(0,Math.min(300,memo.length())));records.link(value);
 }
 public String assigned(Long sourceId){var r=records.source(sourceId);return r!=null&&Boolean.TRUE.equals(r.getActive())?r.getOwnerCode():null;}
 @Transactional public void remove(Long id){operations.lock();require(records.find(id),"용돈 내역");records.remove(id);}
}
