package com.family.asset.service;

import com.family.asset.dto.*;
import com.family.asset.enums.TransactionType;
import java.util.*;

/** Conservative, auditable rules: exact receipt industries and approved merchant exceptions. */
public final class KbCategoryClassifier {
  private KbCategoryClassifier() {}
  public record Suggestion(Long categoryId, String reason) {}
  public static String normalize(String value) {
    return value == null ? "" : value.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
  }
  public static Suggestion suggest(KbImport.Row row, List<Category> categories, Long savedRule) {
    var active=categories.stream().filter(c->Boolean.TRUE.equals(c.getActive())&&c.getTransactionType()==TransactionType.EXPENSE)
        .filter(c->c.getParentId()==null||categories.stream().anyMatch(p->p.getId().equals(c.getParentId())&&Boolean.TRUE.equals(p.getActive())&&p.getTransactionType()==TransactionType.EXPENSE)).toList();
    if(savedRule!=null && active.stream().anyMatch(c->c.getId().equals(savedRule)))
      return new Suggestion(savedRule,"저장한 가맹점·업종 규칙");
    String major=null,minor=null,reason="판단 근거 부족 — 미분류";
    switch(normalize(row.industry())) {
      case "한식", "양식", "일식/생선회집", "일반음식점", "일반음식점 기타", "중식" -> {major="식비";minor="외식";}
      case "커피/음료전문점" -> {major="식비";minor="카페·간식";}
      case "주유소" -> {major="교통·차량";minor="주유·충전";}
      case "슈퍼마켓" -> {major="식비";minor="식료품";}
    }
    if(major!=null)reason="전표 업종: "+row.industry();
    else {
      switch(normalize(row.merchant())) {
        case "쿠팡이츠" -> {major="식비";minor="외식";}
        case "nice(주차장)" -> {major="교통·차량";minor="주차·통행료";}
        case "공공요금" -> {major="주거·통신";minor="관리비·공과금";}
        case "하나로마트성산점" -> {major="식비";minor="식료품";}
      }
      if(major!=null)reason="확인된 가맹점 규칙: "+row.merchant();
    }
    Long id=major==null?null:find(active,major,minor);
    if(id==null){
      if(major!=null)reason="추천 분류 "+major+" > "+minor+"가 없어 미분류";
      id=find(active,"기타","미분류");
    }
    return new Suggestion(id,id==null?"사용 가능한 분류를 선택해주세요.":reason);
  }
  private static Long find(List<Category> categories,String major,String minor) {
    var roots=categories.stream().filter(c->c.getParentId()==null&&c.getName().equals(major)).toList();
    if(roots.size()!=1)return null;
    return categories.stream().filter(c->Objects.equals(c.getParentId(),roots.getFirst().getId())&&c.getName().equals(minor))
        .map(Category::getId).findFirst().orElse(null);
  }
}
