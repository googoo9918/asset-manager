package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.mapper.*;
import java.math.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class CardBillingService {
  private final CardMapper cards;
  private final EntryMapper entries;
  private final InstallmentMapper installments;
  private final InstallmentScheduleMapper schedules;
  private final OccurrenceMapper occurrences;
  private final OperationMapper operations;
  public record Period(LocalDate from,LocalDate to,LocalDate dueDate) {}
  public record Line(Long entryId,Long installmentId,LocalDate transactionDate,String description,
      BigDecimal purchaseAmount,BigDecimal amount,int installment,int months,String status,boolean linked) {}
  public record Statement(Long cardId,String cardName,Long accountId,boolean configured,Period period,
      LocalDate dueDate,String status,BigDecimal expected,BigDecimal actualAmount,Long paymentGroupId,List<Line> lines) {}
  public record AccountBill(Long accountId,LocalDate dueDate,BigDecimal expected,BigDecimal actualAmount,
      BigDecimal difference,boolean completeEstimate,List<Long> cardIds) {}
  public record Result(YearMonth month,List<Statement> cards,List<AccountBill> accounts) {}

  public static void validate(Card card) {
    if(card.getCardType()==CardType.DEBIT){card.setBillingClosingDay(null);card.setBillingMonthOffset(null);return;}
    Integer day=card.getBillingClosingDay(),offset=card.getBillingMonthOffset();
    check((day==null)==(offset==null),"이용기간의 마감 월과 마감일을 함께 설정해주세요.");
    if(day==null)return;
    check(day>=1&&day<=31&&offset>=0&&offset<=2,"이용기간 마감 설정을 확인해주세요.");
    check(offset>0||day<card.getPaymentDay(),"당월 마감일은 결제일보다 앞서야 합니다.");
  }
  public static Period period(Card card,YearMonth month) {
    var closing=month.minusMonths(card.getBillingMonthOffset());
    return new Period(LoanService.day(closing.minusMonths(1),card.getBillingClosingDay()).plusDays(1),
        LoanService.day(closing,card.getBillingClosingDay()),LoanService.day(month,card.getPaymentDay()));
  }
  public static YearMonth firstMonth(Card card,LocalDate date) {
    var closing=YearMonth.from(date);
    if(date.isAfter(LoanService.day(closing,card.getBillingClosingDay())))closing=closing.plusMonths(1);
    return closing.plusMonths(card.getBillingMonthOffset());
  }
  public static BigDecimal installmentAmount(BigDecimal total,int months,int index) {
    var regular=total.divide(BigDecimal.valueOf(months),2,RoundingMode.DOWN);
    return index==months-1?total.subtract(regular.multiply(BigDecimal.valueOf(months-1))):regular;
  }
  private boolean creditEntry(Entry e,Long cardId) {
    return Objects.equals(e.getCardId(),cardId)&&!Boolean.TRUE.equals(e.getVoided())
        &&e.getTransactionType()==TransactionType.EXPENSE&&e.getPaymentMethod()==PaymentMethod.CREDIT;
  }
  public Result month(YearMonth month,String owner) {
    check(Set.of("JOINT","HUSBAND","WIFE").contains(owner),"소유자 범위를 확인해주세요.");
    var allEntries=entries.findAll();var old=installments.findAll();var allSchedules=schedules.findAll();var allOccurrences=occurrences.findAll();
    var selected=cards.findAll().stream().filter(c->c.getCardType()==CardType.CREDIT&&(owner.equals("JOINT")||c.getOwnerCode().name().equals(owner))).toList();
    List<Statement> statements=new ArrayList<>();
    for(var card:selected) {
      boolean configured=card.getBillingClosingDay()!=null&&card.getBillingMonthOffset()!=null;
      var occurrence=allOccurrences.stream().filter(o->Objects.equals(o.getCardId(),card.getId())
          &&("CARD:"+card.getId()).equals(o.getSourceKey())&&YearMonth.from(o.getDueDate()).equals(month)).findFirst().orElse(null);
      var status=occurrence==null?"PENDING":occurrence.getState();
      var due=occurrence!=null?(occurrence.getActualDate()==null?occurrence.getDueDate():occurrence.getActualDate()):LoanService.day(month,card.getPaymentDay());
      Set<Long> linked=new HashSet<>();
      old.stream().filter(i->Objects.equals(i.getCardId(),card.getId())&&i.getSourceEntryId()!=null).forEach(i->linked.add(i.getSourceEntryId()));
      List<Line> lines=new ArrayList<>();
      if(configured)for(var entry:allEntries) {
        if(!creditEntry(entry,card.getId())||linked.contains(entry.getId()))continue;
        int count=entry.getInstallmentMonths()==null?1:entry.getInstallmentMonths();
        long index=ChronoUnit.MONTHS.between(firstMonth(card,entry.getTransactionDate()),month);
        if(index>=0&&index<count)lines.add(new Line(entry.getId(),null,entry.getTransactionDate(),entry.getMemo(),entry.getAmount(),
            installmentAmount(entry.getAmount(),count,(int)index),(int)index+1,count,status,false));
      }
      for(var item:old) {
        if(!Objects.equals(item.getCardId(),card.getId()))continue;
        var sequence=allSchedules.stream().filter(s->Objects.equals(s.getInstallmentId(),item.getId())&&!"CANCELLED".equals(s.getState())).sorted(Comparator.comparing(InstallmentSchedule::getDueDate)).toList();
        for(int index=0;index<sequence.size();index++) {
          var row=sequence.get(index);if(!YearMonth.from(row.getDueDate()).equals(month))continue;
          var source=allEntries.stream().filter(e->Objects.equals(e.getId(),item.getSourceEntryId())).findFirst().orElse(null);
          String rowStatus=item.getSourceEntryId()!=null&&(source==null||!creditEntry(source,card.getId()))?"REVIEW":("PAID".equals(row.getState())?"COMPLETED":status);
          lines.add(new Line(item.getSourceEntryId(),item.getId(),source==null?null:source.getTransactionDate(),item.getMemo(),source==null?null:source.getAmount(),row.getAmount(),index+1,sequence.size(),rowStatus,item.getSourceEntryId()!=null));
        }
      }
      if(card.getStatus()==AssetStatus.CLOSED&&lines.isEmpty()&&occurrence==null)continue;
      statements.add(new Statement(card.getId(),card.getCardName(),occurrence==null?card.getAccountId():occurrence.getAccountId(),configured,
          configured?period(card,month):null,due,status,lines.stream().map(Line::amount).reduce(BigDecimal.ZERO,BigDecimal::add),
          occurrence==null?null:occurrence.getActualAmount(),occurrence==null?null:occurrence.getPaymentGroupId(),lines));
    }
    statements.sort(Comparator.comparing(Statement::dueDate));
    var groups=new LinkedHashMap<String,List<Statement>>();
    for(var statement:statements)groups.computeIfAbsent(statement.accountId()+"/"+statement.dueDate(),k->new ArrayList<>()).add(statement);
    List<AccountBill> bills=new ArrayList<>();
    for(var group:groups.values()) {
      var expected=group.stream().map(Statement::expected).reduce(BigDecimal.ZERO,BigDecimal::add);
      boolean complete=group.stream().allMatch(s->s.configured()&&s.lines().stream().noneMatch(l->"REVIEW".equals(l.status())));
      if(group.stream().anyMatch(s->s.lines().stream().anyMatch(l->l.installmentId()!=null&&!l.linked())
          &&s.lines().stream().anyMatch(l->l.installmentId()==null&&l.months()>1)))complete=false;
      boolean settled=group.stream().allMatch(s->"COMPLETED".equals(s.status()));
      BigDecimal actual=null;Set<Long> seen=new HashSet<>();
      for(var statement:group) {
        BigDecimal value=statement.actualAmount();
        if(statement.paymentGroupId()!=null) {
          if(!seen.add(statement.paymentGroupId()))continue;
          var payment=allOccurrences.stream().filter(o->Objects.equals(o.getId(),statement.paymentGroupId())).findFirst().orElse(null);
          value=payment==null?null:payment.getActualAmount();
          var visibleIds=group.stream().map(Statement::cardId).toList();
          if(allOccurrences.stream().anyMatch(o->Objects.equals(o.getPaymentGroupId(),statement.paymentGroupId())&&!visibleIds.contains(o.getCardId())))complete=false;
        }
        if(value!=null)actual=actual==null?value:actual.add(value);
      }
      bills.add(new AccountBill(group.getFirst().accountId(),group.getFirst().dueDate(),expected,actual,
          actual!=null&&settled&&complete?actual.subtract(expected):null,complete,group.stream().map(Statement::cardId).toList()));
    }
    return new Result(month,statements,bills);
  }
  @Transactional
  public void link(Long id,Long entryId) {
    operations.lock();var item=require(installments.findById(id),"기존 할부");
    if(entryId!=null) {
      var entry=require(entries.findById(entryId),"원거래");
      check(creditEntry(entry,item.getCardId())&&entry.getInstallmentMonths()!=null&&entry.getInstallmentMonths()>1,"같은 카드의 취소되지 않은 할부 구매를 선택해주세요.");
      check(installments.findAll().stream().noneMatch(i->!Objects.equals(i.getId(),id)&&Objects.equals(i.getSourceEntryId(),entryId)),"이미 다른 기존 할부에 연결된 거래입니다.");
    }
    installments.linkSource(id,entryId);
  }
}
