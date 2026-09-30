package com.family.asset.service;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

/** Uses ONLY the explicitly prepared disposable cluster on port 55441. */
@EnabledIfEnvironmentVariable(named="ASSET_BACKUP_DB_TEST",matches="true")
class BackupRoundTripTest {
  @TempDir Path root;
  @Test void nativeDumpRestoresExactAmountsForeignKeysSequencesAndReceipts()throws Exception {
    String source="jdbc:postgresql://127.0.0.1:55441/backup_source";
    try(var c=DriverManager.getConnection(source,"backup_test","");var s=c.createStatement()) {
      s.execute("CREATE TABLE IF NOT EXISTS backup_probe(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,amount numeric(24,2))");
      s.execute("CREATE TABLE IF NOT EXISTS backup_child(id bigint REFERENCES backup_probe(id))");
      s.execute("INSERT INTO backup_probe(amount) VALUES(12345678901234567890.12)");
      s.execute("INSERT INTO backup_child SELECT max(id) FROM backup_probe");
    }
    Path receipts=root.resolve("receipts");Files.createDirectories(receipts);
    Files.writeString(receipts.resolve("synthetic.json"),"{\"receipt\":\"synthetic\"}");
    var service=new BackupService(source,"backup_test","","C:/Program Files/PostgreSQL/18/bin/pg_dump.exe",root.resolve("backups").toString(),receipts.toString());
    var item=service.create();Path archive=service.download(item.name());
    String target="backup_restore_"+UUID.randomUUID().toString().replace("-","");
    Path output=root.resolve("restored"),log=root.resolve("restore.log");
    var args=new ArrayList<>(List.of(System.getenv("ASSET_BACKUP_PYTHON"),"src/main/resources/backup/restore-backup.py","--archive",archive.toString(),"--database",target,"--user","backup_test","--port","55441","--output-dir",output.toString(),"--pg-bin","C:/Program Files/PostgreSQL/18/bin"));
    var builder=new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(log.toFile());
    builder.environment().put("PGPASSWORD","");
    Process process=builder.start();
    process.getOutputStream().write('\n');process.getOutputStream().close();
    boolean done=process.waitFor(60,TimeUnit.SECONDS);if(!done)process.destroyForcibly();
    assertTrue(done);assertEquals(0,process.exitValue(),Files.readString(log));
    assertEquals(Files.readString(receipts.resolve("synthetic.json")),Files.readString(output.resolve("data/kb-card/synthetic.json")));
    try(var c=DriverManager.getConnection("jdbc:postgresql://127.0.0.1:55441/"+target,"backup_test","");var s=c.createStatement()) {
      try(var r=s.executeQuery("SELECT amount FROM backup_probe JOIN backup_child USING(id)")){assertTrue(r.next());assertEquals("12345678901234567890.12",r.getBigDecimal(1).toPlainString());}
      assertDoesNotThrow(()->s.execute("INSERT INTO backup_probe(amount) VALUES(1.23)"));
      assertThrows(SQLException.class,()->s.execute("INSERT INTO backup_child VALUES(-1)"));
    }
    // A second restore to existing output/database must stop without changing it.
    process=new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(log.toFile()).start();process.getOutputStream().close();
    assertTrue(process.waitFor(20,TimeUnit.SECONDS));assertNotEquals(0,process.exitValue());
    args.set(args.indexOf("--output-dir")+1,root.resolve("second-restored").toString());
    process=builder.command(args).start();process.getOutputStream().close();
    assertTrue(process.waitFor(20,TimeUnit.SECONDS));assertNotEquals(0,process.exitValue());
    assertTrue(Files.readString(log).contains("database already exists"));
    assertFalse(Files.exists(root.resolve("second-restored")));
  }
}
