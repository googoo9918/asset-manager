package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.dto.*;
import com.family.asset.enums.TransactionType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;

class KbCategoryClassifierTest {
  static Category category(long id,String name,Long parent) {
    var c=new Category();c.setId(id);c.setName(name);c.setParentId(parent);c.setActive(true);c.setTransactionType(TransactionType.EXPENSE);return c;
  }
  final List<Category> categories=List.of(category(1,"식비",null),category(2,"외식",1L),category(3,"카페·간식",1L),category(4,"식료품",1L),
      category(5,"기타",null),category(6,"미분류",5L),category(7,"교통·차량",null),category(8,"주차·통행료",7L),category(9,"주유·충전",7L),
      category(10,"주거·통신",null),category(11,"관리비·공과금",10L));
  KbImport.Row row(String merchant,String industry) {return new KbImport.Row(LocalDate.of(2026,9,16),merchant,BigDecimal.TEN,"APPROVED",1,"123",false,industry);}
  @Test void distinguishesSameMerchantByReceiptIndustry() {
    assertEquals(2L,KbCategoryClassifier.suggest(row("아워홈","일반음식점 기타"),categories,null).categoryId());
    assertEquals(3L,KbCategoryClassifier.suggest(row("아워홈","커피/음료전문점"),categories,null).categoryId());
    assertEquals(9L,KbCategoryClassifier.suggest(row("주유소","주유소"),categories,null).categoryId());
    assertEquals(4L,KbCategoryClassifier.suggest(row("마트","슈퍼마켓"),categories,null).categoryId());
  }
  @Test void broadMerchantsRemainUnclassifiedExceptExactApprovedExceptions() {
    for(String merchant:List.of("쿠팡(쿠페이)","KIOSK_나이스","쿠팡이츠 상품권","카페처럼 보이는 이름"))
      assertEquals(6L,KbCategoryClassifier.suggest(row(merchant,"전자상거래PG"),categories,null).categoryId());
    for(String industry:List.of("편의점","백화점","휴게음식점",""))
      assertEquals(6L,KbCategoryClassifier.suggest(row("모르는 가맹점",industry),categories,null).categoryId());
    assertEquals(2L,KbCategoryClassifier.suggest(row("쿠팡이츠","전자상거래PG"),categories,null).categoryId());
    assertEquals(8L,KbCategoryClassifier.suggest(row("NICE(주차장)","전자상거래PG"),categories,null).categoryId());
    assertEquals(11L,KbCategoryClassifier.suggest(row("공공요금","전자상거래PG"),categories,null).categoryId());
  }
  @Test void savedRuleWinsButInactiveCategoriesAreNotSuggested() {
    assertEquals(4L,KbCategoryClassifier.suggest(row("카페","커피/음료전문점"),categories,4L).categoryId());
    categories.get(3).setActive(false);
    assertEquals(3L,KbCategoryClassifier.suggest(row("카페","커피/음료전문점"),categories,4L).categoryId());
    categories.get(0).setActive(false);
    assertEquals(6L,KbCategoryClassifier.suggest(row("카페","커피/음료전문점"),categories,3L).categoryId());
  }
}
