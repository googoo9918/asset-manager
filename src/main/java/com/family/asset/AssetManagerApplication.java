package com.family.asset;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@MapperScan("com.family.asset.mapper")
public class AssetManagerApplication {
  public static void main(String[] args) {
    SpringApplication.run(AssetManagerApplication.class, args);
  }
}
