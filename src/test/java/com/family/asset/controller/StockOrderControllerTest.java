package com.family.asset.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.family.asset.exception.ApiExceptionHandler;
import com.family.asset.service.StockOrderService;
import com.family.asset.mapper.StockOrderMapper;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class StockOrderControllerTest {
  StockOrderService service;MockMvc mvc;
  @BeforeEach void setup() {
    service=mock(StockOrderService.class);mvc=MockMvcBuilders.standaloneSetup(new StockOrderController(service)).setControllerAdvice(new ApiExceptionHandler()).build();
  }
  String request(String qty,String exchange,String side) {
    return "{\"accountId\":1,\"exchange\":\""+exchange+"\",\"symbol\":\"AAPL\",\"side\":\""+side+"\",\"orderType\":\"CURRENT\",\"quantity\":\""+qty+"\"}";
  }
  @Test void orderNumberIsNotRequiredForReadOnlyCandidateInquiry() throws Exception {
    when(service.candidates("test")).thenReturn(java.util.List.of());
    mvc.perform(get("/api/securities/orders/test/candidates")).andExpect(status().isOk()).andExpect(content().json("[]"));
    verify(service).candidates("test");verifyNoMoreInteractions(service);
  }
  @Test void invalidQuantityMarketOrSideNeverReachesBrokerService() throws Exception {
    for(String qty:new String[]{"0","-1","1.5","1000000000"})mvc.perform(post("/api/securities/orders/preview").contentType(MediaType.APPLICATION_JSON).content(request(qty,"NASD","BUY"))).andExpect(status().isBadRequest());
    mvc.perform(post("/api/securities/orders/preview").contentType(MediaType.APPLICATION_JSON).content(request("1","INVALID","BUY"))).andExpect(status().isBadRequest());
    mvc.perform(post("/api/securities/orders/preview").contentType(MediaType.APPLICATION_JSON).content(request("1","NASD","INVALID"))).andExpect(status().isBadRequest());
    verifyNoInteractions(service);
  }
  @Test void formPostCannotTriggerOrderAndConfirmOnlyUsesStoredId() throws Exception {
    mvc.perform(post("/api/securities/orders/test/confirm").contentType(MediaType.APPLICATION_FORM_URLENCODED).content("quantity=500")).andExpect(status().is4xxClientError());
    verifyNoInteractions(service);
    mvc.perform(post("/api/securities/orders/test/confirm").contentType(MediaType.APPLICATION_JSON).content("{\"quantity\":500,\"price\":1}")).andExpect(status().isOk());
    verify(service).confirm("test");verifyNoMoreInteractions(service);
  }
  @Test void combinedOwnerFilterIsSupportedWithoutAddingJointToAccountOwners() throws Exception {
    var orders=mock(StockOrderMapper.class);
    var actual=new StockOrderService(orders,null,null,null);
    var endpoint=MockMvcBuilders.standaloneSetup(new StockOrderController(actual)).setControllerAdvice(new ApiExceptionHandler()).build();
    for(String owner:new String[]{"JOINT","HUSBAND","WIFE"}) {
      endpoint.perform(get("/api/securities/orders").param("owner",owner)).andExpect(status().isOk());
      verify(orders).list(owner);
    }
    endpoint.perform(get("/api/securities/orders")).andExpect(status().isOk());verify(orders,times(2)).list("JOINT");
    endpoint.perform(get("/api/securities/orders").param("owner","INVALID")).andExpect(status().isBadRequest());verifyNoMoreInteractions(orders);
  }
}
