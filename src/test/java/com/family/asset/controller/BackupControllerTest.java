package com.family.asset.controller;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import com.family.asset.exception.BusinessException;
import com.family.asset.service.BackupService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
class BackupControllerTest {
  final BackupController controller=new BackupController(mock(BackupService.class));
  MockHttpServletRequest request(){var r=new MockHttpServletRequest();r.setRemoteAddr("127.0.0.1");r.setScheme("http");r.setServerName("127.0.0.1");r.setServerPort(8080);return r;}
  @Test void acceptsLocalApp()throws Exception{var r=request();r.addHeader("Origin","http://127.0.0.1:8080");controller.localOnly(r);}
  @Test void rejectsRemoteClient(){var r=request();r.setRemoteAddr("192.168.0.2");assertThrows(BusinessException.class,()->controller.localOnly(r));}
  @Test void rejectsCrossSiteAndWrongOrigin(){var r=request();r.addHeader("Sec-Fetch-Site","cross-site");assertThrows(BusinessException.class,()->controller.localOnly(r));var other=request();other.addHeader("Origin","http://example.invalid");assertThrows(BusinessException.class,()->controller.localOnly(other));}
}
