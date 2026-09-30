package com.family.asset.controller;

import static com.family.asset.exception.BusinessException.check;
import com.family.asset.exception.BusinessException;
import com.family.asset.service.BackupService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.*;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/backups")
public class BackupController {
  private final BackupService backups;
  public BackupController(BackupService backups){this.backups=backups;}
  @ModelAttribute
  void localOnly(HttpServletRequest request)throws UnknownHostException {
    check(InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress(),"백업은 이 PC에서만 사용할 수 있습니다.");
    check(!"cross-site".equals(request.getHeader("Sec-Fetch-Site")),"앱 화면에서 다시 요청해주세요.");
    String origin=request.getHeader("Origin");
    if(origin!=null){
      URI uri;try{uri=URI.create(origin);}catch(Exception e){throw new BusinessException("요청 출처를 확인해주세요.");}
      int port=uri.getPort()<0?("https".equals(uri.getScheme())?443:80):uri.getPort();
      check(request.getScheme().equals(uri.getScheme())&&request.getServerName().equalsIgnoreCase(uri.getHost())&&request.getServerPort()==port,"앱 화면에서 다시 요청해주세요.");
    }
  }
  @GetMapping public Object status()throws IOException{return backups.status();}
  @PostMapping public Object create()throws IOException{return backups.create();}
  @GetMapping("/{name}") public ResponseEntity<Resource> download(@PathVariable String name)throws IOException {
    var file=backups.download(name);
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\""+name+"\"")
        .cacheControl(CacheControl.noStore()).contentLength(java.nio.file.Files.size(file))
        .body(new FileSystemResource(file));
  }
}
