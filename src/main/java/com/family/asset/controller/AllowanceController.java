package com.family.asset.controller;
import com.family.asset.dto.AllowanceRecord;
import com.family.asset.service.AllowanceService;
import java.time.YearMonth;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/allowance") @RequiredArgsConstructor
public class AllowanceController {
 private final AllowanceService service;
 @GetMapping public Object list(@RequestParam String month,@RequestParam(defaultValue="JOINT") String owner){return service.list(YearMonth.parse(month),owner);}
 @PostMapping public Object create(@RequestBody AllowanceRecord row){return service.manual(null,row);}
 @PutMapping("/{id}") public Object update(@PathVariable Long id,@RequestBody AllowanceRecord row){return service.manual(id,row);}
 public record Assignment(String ownerCode){}
 @GetMapping("/source/{id}") public Object assignment(@PathVariable Long id){return service.assignment(id);}
 @PutMapping("/source/{id}") public void assign(@PathVariable Long id,@RequestBody Assignment value){service.assign(id,value.ownerCode());}
 @DeleteMapping("/{id}") public void remove(@PathVariable Long id){service.remove(id);}
}
