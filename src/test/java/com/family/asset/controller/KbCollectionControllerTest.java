package com.family.asset.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.family.asset.service.KbBrowserService;
import com.family.asset.exception.ApiExceptionHandler;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class KbCollectionControllerTest {
  @Test void defaultsToIncrementalAndRejectsInvalidModesBeforeStartingBrowser() throws Exception {
    var browser=mock(KbBrowserService.class);
    var mvc=MockMvcBuilders.standaloneSetup(new KbImportController(browser,null,null,null)).setControllerAdvice(new ApiExceptionHandler()).build();
    for(String mode:new String[]{"incremental","all","none"}) {
      mvc.perform(post("/api/kb-card/collect").contentType(MediaType.APPLICATION_JSON).content("{\"receiptMode\":\""+mode+"\"}")).andExpect(status().isOk());
      verify(browser).call(Map.of("action","collect","receiptMode",mode));
    }
    mvc.perform(post("/api/kb-card/collect").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
    mvc.perform(post("/api/kb-card/collect")).andExpect(status().isOk());
    verify(browser,times(3)).call(Map.of("action","collect","receiptMode","incremental"));
    clearInvocations(browser);
    mvc.perform(post("/api/kb-card/collect").contentType(MediaType.APPLICATION_JSON).content("{\"receiptMode\":\"invalid\"}")).andExpect(status().isBadRequest());
    verifyNoInteractions(browser);
  }
}
