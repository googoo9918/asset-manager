package com.family.asset.service;

import static com.family.asset.exception.BusinessException.*;

import com.family.asset.dto.*;
import com.family.asset.mapper.*;
import java.math.BigDecimal;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Transactional
public class SnapshotService {
  private final OperationMapper ops;
  private final CatalogService catalog;
  private final QueryService query;
  private final HoldingMapper holdings;
  private final ObjectMapper json;

  public List<Map<String,Object>> dailyPrices(String owner, java.time.LocalDate from, java.time.LocalDate to, Long account) {
    check(Set.of("JOINT","HUSBAND","WIFE").contains(owner),"소유자를 확인해주세요.");
    check(!from.isAfter(to) && java.time.temporal.ChronoUnit.DAYS.between(from,to)<=366,
        "조회 기간은 시작일 이후 최대 1년으로 지정해주세요.");
    var filter=new HashMap<String,Object>();
    filter.put("owner",owner);filter.put("from",from.toString());filter.put("to",to.toString());
    filter.put("account",account==null?null:account.toString());
    return ops.dailyPrices(filter);
  }

  public Map<String, Object> capture(String status) {
    ops.lock();
    var sum = query.summary("JOINT");
    Map<String, Object> row = new HashMap<>(sum);
    row.put("syncStatus", status);
    ops.snapshot(row);
    Long id = ((Number) row.get("id")).longValue();
    for (var a : catalog.accounts())
      item(
          id,
          "ACCOUNT",
          a.getId(),
          a.getOwnerCode().name(),
          a.getAssetType().name(),
          a.getCurrentBalanceKrw(),
          a);
    for (var l : catalog.loans())
      item(id, "LOAN", l.getId(), l.getOwnerCode().name(), null, l.getCurrentBalance(), l);
    for (var h : holdings.findAll()) {
      h.setAccountName(catalog.account(h.getAccountId()).getAccountName());
      item(
          id,
          "POSITION",
          h.getId(),
          catalog.account(h.getAccountId()).getOwnerCode().name(),
          "SECURITIES",
          h.getValueKrw(),
          h);
    }
    return row;
  }

  private void item(
      Long snapshot,
      String type,
      Long id,
      String owner,
      String assetType,
      BigDecimal amount,
      Object detail) {
    Map<String, Object> m = new HashMap<>();
    m.put("snapshotId", snapshot);
    m.put("itemType", type);
    m.put("entityId", id);
    m.put("ownerCode", owner);
    m.put("assetType", assetType);
    m.put("amount", amount);
    m.put("details", json.writeValueAsString(detail));
    ops.snapshotItem(m);
  }

  public List<Map<String, Object>> list(String owner) {
    var rows = ops.snapshots();
    for (var r : rows) {
      var items = ops.snapshotItems(((Number) r.get("id")).longValue());
      BigDecimal assets = BigDecimal.ZERO, debts = BigDecimal.ZERO;
      for (var i : items) {
        if (owner != null && !owner.equals("JOINT") && !owner.equals(i.get("owner_code"))) continue;
        if (i.get("item_type").equals("ACCOUNT"))
          assets = assets.add((BigDecimal) i.get("amount_krw"));
        if (i.get("item_type").equals("LOAN")) debts = debts.add((BigDecimal) i.get("amount_krw"));
      }
      r.put("total_assets", assets);
      r.put("total_debts", debts);
      r.put("net_assets", assets.subtract(debts));
    }
    return rows;
  }

  public List<Map<String, Object>> detail(Long id) {
    check(
        ops.snapshots().stream().anyMatch(s -> ((Number) s.get("id")).longValue() == id),
        "스냅샷을 찾을 수 없습니다.");
    return ops.snapshotItems(id);
  }

  public List<Map<String, Object>> compare(Long from, Long to, String owner) {
    Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
    for (int idx = 0; idx < 2; idx++) {
      for (var item : detail(idx == 0 ? from : to)) {
        if (owner != null && !owner.equals("JOINT") && !owner.equals(item.get("owner_code")))
          continue;
        String key = item.get("item_type") + ":" + item.get("entity_id");
        if (item.get("item_type").equals("POSITION")) {
          var d = json.readTree(item.get("details").toString());
          key =
              "POSITION:"
                  + d.path("accountId").asText()
                  + ":"
                  + d.path("symbol").asText()
                  + ":"
                  + d.path("currencyCode").asText();
        }
        var row =
            rows.computeIfAbsent(
                key,
                k ->
                    new HashMap<>(
                        Map.of("key", k, "before", BigDecimal.ZERO, "after", BigDecimal.ZERO)));
        row.put(idx == 0 ? "before" : "after", item.get("amount_krw"));
        row.put("details", item.get("details"));
      }
    }
    for (var r : rows.values())
      r.put("change", ((BigDecimal) r.get("after")).subtract((BigDecimal) r.get("before")));
    return new ArrayList<>(rows.values());
  }
}
