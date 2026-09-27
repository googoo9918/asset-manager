package com.family.asset.kis;

import java.util.*;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "kis")
public class KisProperties {
  private boolean enabled = false;
  private boolean tradingEnabled = false;
  private String baseUrl = "https://openapi.koreainvestment.com:9443";
  private String appKey = "";
  private String appSecret = "";
  private Map<Long, Credential> accounts = new HashMap<>();

  @Data
  public static class Credential {
    private String appKey = "";
    private String appSecret = "";
  }

  public Credential credentials(Long id) {
    if (accounts.containsKey(id)) return accounts.get(id);
    var c = new Credential();
    c.setAppKey(appKey);
    c.setAppSecret(appSecret);
    return c;
  }
}
