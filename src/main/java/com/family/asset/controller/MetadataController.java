package com.family.asset.controller;

import com.family.asset.enums.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class MetadataController {
  @GetMapping("/metadata")
  public Map<String, Object> metadata() {
    Map<String, Object> r = new LinkedHashMap<>();
    for (Class<?> c :
        List.of(
            OwnerCode.class,
            Attribution.class,
            AssetType.class,
            AssetStatus.class,
            CardType.class,
            TransactionType.class,
            PaymentMethod.class,
            RepaymentType.class,
            PlanType.class,
            RepeatCycle.class,
            FinancialInstitution.class)) {
      List<Map<String, String>> values = new ArrayList<>();
      for (Object e : c.getEnumConstants())
        try {
          values.add(
              Map.of(
                  "code",
                  ((Enum<?>) e).name(),
                  "label",
                  c.getMethod("getLabel").invoke(e).toString()));
        } catch (ReflectiveOperationException ex) {
          throw new IllegalStateException(ex);
        }
      r.put(c.getSimpleName(), values);
    }
    return r;
  }
}
