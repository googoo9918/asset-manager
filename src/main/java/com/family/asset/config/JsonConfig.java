package com.family.asset.config;

import java.math.BigDecimal;
import org.springframework.context.annotation.*;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.std.ToStringSerializer;

@Configuration
public class JsonConfig {
  @Bean
  public SimpleModule moneyModule() {
    var m = new SimpleModule();
    m.addSerializer(BigDecimal.class, ToStringSerializer.instance);
    return m;
  }
}
