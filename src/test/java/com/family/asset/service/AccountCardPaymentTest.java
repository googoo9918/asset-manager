package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.exception.BusinessException;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;

class AccountCardPaymentTest {
  final CatalogService catalog=mock(CatalogService.class);
  final OccurrenceMapper mapper=mock(OccurrenceMapper.class);
  final OperationMapper ops=mock(OperationMapper.class);
  final InstallmentService installments=mock(InstallmentService.class);
  final PlanService service=new PlanService(catalog,mock(LoanService.class),mock(LedgerService.class),mapper,ops,installments);
  final List<Occurrence> rows=new ArrayList<>();
  final LocalDate date=LocalDate.of(2030,1,10);
  BigDecimal n(String value){return new BigDecimal(value);}
  @BeforeEach void setup(){
    var account=new Account();account.setId(7L);account.setAccountName("결제 계좌");account.setOwnerCode(OwnerCode.HUSBAND);
    when(catalog.activeAccount(7L)).thenReturn(account);when(catalog.account(7L)).thenReturn(account);
    when(mapper.findAll()).thenAnswer(i->rows);
    when(mapper.findById(anyLong())).thenAnswer(i->rows.stream().filter(o->o.getId().equals(i.getArgument(0))).findFirst().orElse(null));
    doAnswer(i->{Occurrence o=i.getArgument(0);o.setId(100L);rows.add(o);return 1;}).when(mapper).insert(any());
    add(1,7,date);add(2,7,date);
    when(installments.total(anyLong(),any())).thenReturn(n("100"));
  }
  Occurrence add(long id,long accountId,LocalDate due){
    var o=new Occurrence();o.setId(id);o.setCardId(id);o.setAccountId(accountId);o.setDueDate(due);
    o.setPlanType(PlanType.CARD_PAYMENT);o.setState("PENDING");o.setSourceKey("CARD:"+id);rows.add(o);
    var c=new Card();c.setId(id);c.setAccountId(accountId);c.setCardType(CardType.CREDIT);c.setStatus(AssetStatus.ACTIVE);
    when(catalog.card(id)).thenReturn(c);return o;
  }
  Commands.AccountCardPayment payment(String amount,Long...ids){return new Commands.AccountCardPayment(7L,List.of(ids),date,n(amount));}
  @Test void oneWithdrawalCompletesAllCardsWithoutInventingPerCardAmounts(){
    var group=service.confirmCardAccount(payment("1000",1L,2L));
    verify(ops,times(1)).changeBalance(7L,n("-1000"));verify(ops,never()).cardPayment(any());
    assertEquals(n("1000"),group.getActualAmount());assertNull(group.getCardId());
    assertEquals(2,service.cardAccountGroup(group.getId()).size());
    for(long id:List.of(1L,2L)){
      var o=service.get(id);assertEquals("COMPLETED",o.getState());assertNull(o.getActualAmount());assertEquals(group.getId(),o.getPaymentGroupId());
      verify(installments).settle(id,o,new Commands.Payment(date,n("100")));
    }
    assertThrows(BusinessException.class,()->service.confirmCardAccount(payment("1000",1L,2L)));
    verify(ops,times(1)).changeBalance(anyLong(),any());
  }
  @Test void rejectsUnderpaymentBeforeAnyMutation(){
    assertThrows(BusinessException.class,()->service.confirmCardAccount(payment("199.99",1L,2L)));
    verify(mapper,never()).insert(any());verify(mapper,never()).update(any());verify(ops,never()).changeBalance(anyLong(),any());
  }
  @Test void acceptsDisplayedWonTotalAndDebitsOnlyActualInput(){
    when(installments.total(1L,YearMonth.from(date))).thenReturn(n("33333.33"));
    when(installments.total(2L,YearMonth.from(date))).thenReturn(n("10000.01"));
    var group=service.confirmCardAccount(payment("43333.00",1L,2L));
    assertEquals(n("43333.00"),group.getActualAmount());
    assertEquals(n("43333.34"),group.getAmount());
    verify(ops).changeBalance(7L,n("-43333.00"));
    verify(installments).settle(1L,service.get(1L),new Commands.Payment(date,n("33333.33")));
  }
  @Test void rejectsPartialDuplicatedAndStaleMembership(){
    assertThrows(BusinessException.class,()->service.confirmCardAccount(payment("1000",1L)));
    assertThrows(BusinessException.class,()->service.confirmCardAccount(payment("1000",1L,1L)));
    add(3,7,date);
    assertThrows(BusinessException.class,()->service.confirmCardAccount(payment("1000",1L,2L)));
    verify(ops,never()).changeBalance(anyLong(),any());
  }
  @Test void groupsByAccountEffectiveDateAndBillingMonth(){
    add(3,8,date);add(4,7,date.plusDays(1));
    var old=add(5,7,date.minusMonths(1));old.setActualDate(date);
    assertEquals(List.of(1L,2L),service.cardAccountGroup(1L).stream().map(Occurrence::getId).toList());
  }
  @Test void rejectsChangedCardAccount(){
    catalog.card(2L).setAccountId(8L);
    assertThrows(BusinessException.class,()->service.confirmCardAccount(payment("1000",1L,2L)));
    verify(mapper,never()).insert(any());
  }
  @Test void movesWholeGroupAndPreservesBillingMonth(){
    var moved=date.plusMonths(1);
    service.moveCardAccount(new Commands.OccurrenceGroup(7L,List.of(1L,2L),moved));
    for(var o:rows){assertEquals(date,o.getDueDate());assertEquals(moved,o.getActualDate());}
  }
  @Test void cancellationWithInstallmentsFailsBeforeCancellingAnyMember(){
    when(installments.total(1L,YearMonth.from(date))).thenReturn(BigDecimal.ZERO);
    assertThrows(BusinessException.class,()->service.cancelCardAccount(new Commands.OccurrenceGroup(7L,List.of(1L,2L),date)));
    assertTrue(rows.stream().allMatch(o->o.getState().equals("PENDING")));verify(mapper,never()).update(any());
    when(installments.total(2L,YearMonth.from(date))).thenReturn(BigDecimal.ZERO);
    service.cancelCardAccount(new Commands.OccurrenceGroup(7L,List.of(1L,2L),date));
    assertTrue(rows.stream().allMatch(o->o.getState().equals("CANCELLED")));
  }
}
