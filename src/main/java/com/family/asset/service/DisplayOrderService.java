package com.family.asset.service;

import static com.family.asset.exception.BusinessException.check;
import com.family.asset.dto.*;
import com.family.asset.enums.AssetType;
import com.family.asset.mapper.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DisplayOrderService {
  private final AccountMapper accounts;
  private final CardMapper cards;
  private final OperationMapper operations;
  private final DisplayOrderMapper mapper;

  /**
   * 모든 소유자의 해당 유형 목록을 한 번에 정렬한다. 같은 DB를 쓰는 브라우저들이 공유한다.
   * 금융 변경과 동일한 advisory lock을 사용하고, 순서 갱신 도중 오류가 나면 전체 롤백한다.
   * 목록 로딩 후 등록/삭제가 있었다면 ID 집합이 달라지므로 재조회하도록 안내한다.
   */
  @Transactional
  public void save(String scope, List<Long> ids) {
    operations.lock();
    check(Set.of("CASH", "SAVINGS", "SECURITIES", "CARDS").contains(scope), "지원하지 않는 정렬 유형입니다.");
    List<Long> expected = scope.equals("CARDS")
        ? cards.findAll().stream().map(Card::getId).toList()
        : accounts.findAll().stream().filter(a -> a.getAssetType() == AssetType.valueOf(scope)).map(Account::getId).toList();
    check(ids.size() == expected.size() && new HashSet<>(ids).size() == ids.size()
        && new HashSet<>(ids).equals(new HashSet<>(expected)), "목록이 변경되었거나 순서 정보가 올바르지 않습니다. 닫은 뒤 다시 열어주세요.");
    for (int position = 0; position < ids.size(); position++) {
      int changed = scope.equals("CARDS") ? mapper.updateCard(ids.get(position), position) : mapper.updateAccount(ids.get(position), position);
      check(changed == 1, "순서 저장 대상이 없습니다. 다시 조회해주세요.");
    }
  }
}
