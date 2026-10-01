package com.family.asset.controller;
import com.family.asset.service.ReviewService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/review")
@RequiredArgsConstructor
public class ReviewController {
 private final ReviewService review;
 @GetMapping public Object list(@RequestParam(defaultValue="JOINT") String owner){return review.list(owner);}
 public record Classification(@jakarta.validation.constraints.NotNull Long categoryId,Long expectedCategoryId) {}
 @PostMapping("/entries/{id}/category") public void classify(@PathVariable Long id,@jakarta.validation.Valid @RequestBody Classification value){review.classify(id,value.categoryId(),value.expectedCategoryId());}
 @GetMapping("/summary") public Object summary(@RequestParam(defaultValue="JOINT") String owner){var result=review.list(owner);return Map.of("total",result.total(),"counts",result.counts());}
}
