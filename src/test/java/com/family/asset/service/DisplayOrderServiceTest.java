package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;
import com.family.asset.dto.Account;
import com.family.asset.enums.AssetType;
import com.family.asset.exception.BusinessException;
import com.family.asset.mapper.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class DisplayOrderServiceTest {
  private final AccountMapper accounts = mock(AccountMapper.class);
  private final CardMapper cards = mock(CardMapper.class);
  private final OperationMapper operations = mock(OperationMapper.class);
  private final DisplayOrderMapper mapper = mock(DisplayOrderMapper.class);
  private final DisplayOrderService service = new DisplayOrderService(accounts, cards, operations, mapper);

  private Account account(long id, AssetType type) {
    var a = new Account(); a.setId(id); a.setAssetType(type); return a;
  }

  @Test void rejectsDuplicatesBeforeWriting() {
    when(accounts.findAll()).thenReturn(List.of(account(1, AssetType.CASH), account(2, AssetType.CASH)));
    assertThrows(BusinessException.class, () -> service.save("CASH", List.of(1L, 1L)));
    verifyNoInteractions(mapper);
  }

  @Test void rejectsOmittedOrForeignAccount() {
    when(accounts.findAll()).thenReturn(List.of(account(1, AssetType.CASH), account(2, AssetType.SAVINGS)));
    assertThrows(BusinessException.class, () -> service.save("CASH", List.of(2L)));
    verifyNoInteractions(mapper);
  }

  @Test void locksBeforeUpdatingEveryPosition() {
    when(accounts.findAll()).thenReturn(List.of(account(1, AssetType.CASH), account(2, AssetType.CASH)));
    when(mapper.updateAccount(anyLong(), anyInt())).thenReturn(1);
    service.save("CASH", List.of(2L, 1L));
    var order = inOrder(operations, mapper);
    order.verify(operations).lock();
    order.verify(mapper).updateAccount(2L, 0);
    order.verify(mapper).updateAccount(1L, 1);
  }
}
