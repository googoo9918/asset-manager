package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.family.asset.dto.*;
import com.family.asset.enums.*;
import com.family.asset.kis.*;
import com.family.asset.mapper.StockOrderMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import com.family.asset.exception.BusinessException;

class StockOrderFailureTest {
  @Test void emptyInquiryDoesNotRejectLinkOrResendUnknownOrder() throws Exception {
    var orders=mock(StockOrderMapper.class);var catalog=mock(CatalogService.class);var broker=mock(KisOrderClient.class);
    var config=new KisProperties();config.setEnabled(true);config.setAppKey("test");config.setAppSecret("test");
    config.setBaseUrl("https://openapivts.koreainvestment.com:29443");
    var a=new Account();a.setId(1L);a.setAccountNumber("12345678-01");a.setOwnerCode(OwnerCode.HUSBAND);a.setAssetType(AssetType.SECURITIES);a.setKisLinked(true);
    var o=new StockOrder();o.setId("test");o.setAccountId(1L);o.setEnvironment("DEMO");o.setStatus("UNKNOWN");
    o.setAccountBinding(java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest("DEMO|1234567801|HUSBAND|test".getBytes(java.nio.charset.StandardCharsets.UTF_8))));
    when(orders.find("test")).thenReturn(o);when(catalog.account(1L)).thenReturn(a);when(broker.candidates(a,o)).thenReturn(java.util.List.of());
    var service=new StockOrderService(orders,catalog,config,broker);
    assertTrue(service.candidates("test").isEmpty());assertEquals("UNKNOWN",o.getStatus());assertNull(o.getBrokerOrderId());
    verify(orders).find("test");verifyNoMoreInteractions(orders);
    verify(broker).candidates(a,o);verifyNoMoreInteractions(broker);
  }
  @Test void diagnosticsDistinguishFailuresWithoutExposingRawMessagesOrBodies() {
    var http=new RestClientResponseException("secret",503,"secret",null,"secret".getBytes(),null);
    assertEquals("KIS HTTP 오류 (503)",StockOrderService.failureReason(http));
    assertEquals("KIS 통신 오류 또는 응답 시간 초과",StockOrderService.failureReason(new ResourceAccessException("secret")));
    assertEquals("KIS 응답 검증 실패",StockOrderService.failureReason(new BusinessException("secret")));
    assertEquals("주문 처리 중 내부 오류",StockOrderService.failureReason(new IllegalStateException("secret")));
  }
}
