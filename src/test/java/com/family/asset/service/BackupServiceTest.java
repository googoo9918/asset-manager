package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import com.family.asset.exception.BusinessException;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipFile;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

class BackupServiceTest {
  @TempDir Path root;
  BackupService fake(boolean fail) {
    return new BackupService("jdbc:postgresql://127.0.0.1/test","test","secret","",root.resolve("backups").toString(),root.resolve("receipts").toString()) {
      @Override protected void dumpDatabase(Path target)throws java.io.IOException {
        if(fail)throw new BusinessException("test failure");
        Files.writeString(target,"PGDMP synthetic snapshot");
      }
    };
  }
  @Test void includesDatabaseReceiptsChecksumsAndRestoreToolButNoCredentials()throws Exception {
    Files.createDirectories(root.resolve("receipts/receipt-cache"));
    Files.writeString(root.resolve("receipts/receipt-cache/test.json"),"{\"synthetic\":true}");
    Files.writeString(root.resolve("receipts/temp.tmp"),"not included");
    var service=fake(false);var item=service.create();
    try(var zip=new ZipFile(service.download(item.name()).toFile())) {
      var manifest=new ObjectMapper().readTree(zip.getInputStream(zip.getEntry("manifest.json")));
      assertEquals("asset-manager-backup",manifest.path("format").asText());
      assertEquals(4,manifest.path("files").size());
      assertNotNull(zip.getEntry("data/kb-card/receipt-cache/test.json"));
      assertNotNull(zip.getEntry("restore-backup.py"));
      assertNull(zip.getEntry("application-local.yml"));assertNull(zip.getEntry("data/kb-card/temp.tmp"));
      for(var entry:manifest.path("files")) {
        byte[] bytes=zip.getInputStream(zip.getEntry(entry.path("path").asText())).readAllBytes();
        assertEquals(bytes.length,entry.path("bytes").asLong());
        assertEquals(HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)),entry.path("sha256").asText());
      }
    }
    assertEquals(1,((List<?>)service.status().get("backups")).size());
    assertThrows(BusinessException.class,()->service.download("../application-local.yml"));
    assertThrows(BusinessException.class,()->service.download("backup-00000000-0000-0000-0000-000000000000.zip"));
  }
  @Test void failedDumpLeavesNoPartialBackupsAndUnlocks()throws Exception {
    var service=fake(true);assertThrows(BusinessException.class,service::create);
    assertEquals(false,service.status().get("running"));
    try(var files=Files.list(root.resolve("backups"))){assertEquals(0,files.count());}
  }
}
