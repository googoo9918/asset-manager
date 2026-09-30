package com.family.asset.service;

import static com.family.asset.exception.BusinessException.check;
import com.family.asset.exception.BusinessException;
import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

/** Native PostgreSQL snapshots plus immutable copies of collected card files. */
@Service
public class BackupService {
  private final String url,user,password,configuredDump;
  private final Path directory,receipts;
  private final AtomicBoolean busy=new AtomicBoolean();
  private final ObjectMapper json=new ObjectMapper();
  public BackupService(@Value("${spring.datasource.url}") String url,
      @Value("${spring.datasource.username}") String user,
      @Value("${spring.datasource.password:}") String password,
      @Value("${app.backup.pg-dump:}") String dump,
      @Value("${app.backup.directory:.local/backups}") String directory,
      @Value("${app.backup.receipts:data/kb-card}") String receipts) {
    this.url=url;this.user=user;this.password=password;this.configuredDump=dump;
    this.directory=Path.of(directory).toAbsolutePath().normalize();
    this.receipts=Path.of(receipts).toAbsolutePath().normalize();
  }
  public record Item(String name,String createdAt,long bytes) {}
  public Map<String,Object> status() throws IOException {
    List<Item> items=new ArrayList<>();
    if(Files.isDirectory(directory))try(var files=Files.list(directory)) {
      for(Path p:files.filter(this::validArchive).toList())items.add(item(p));
    }
    items.sort(Comparator.comparing(Item::createdAt).reversed());
    boolean available=Files.isExecutable(dumpTool());
    return Map.of("running",busy.get(),"available",available,"backups",items,
        "message",available?"DB와 수집 전표를 이 PC에 백업합니다.":"PostgreSQL pg_dump 경로를 app.backup.pg-dump에 설정해주세요.");
  }
  private boolean validArchive(Path p) {
    return p.getFileName().toString().matches("backup-[0-9a-f-]{36}\\.zip")&&Files.isRegularFile(p,LinkOption.NOFOLLOW_LINKS);
  }
  private Item item(Path p)throws IOException{return new Item(p.getFileName().toString(),Files.getLastModifiedTime(p).toInstant().toString(),Files.size(p));}
  public Path download(String name) {
    check(name.matches("backup-[0-9a-f-]{36}\\.zip"),"백업 파일명을 확인해주세요.");
    Path p=directory.resolve(name);
    check(validArchive(p),"백업 파일이 없습니다.");return p;
  }
  Path dumpTool() {
    if(!configuredDump.isBlank())return Path.of(configuredDump);
    String exe=System.getProperty("os.name").startsWith("Windows")?"pg_dump.exe":"pg_dump";
    for(String path:System.getenv().getOrDefault("PATH","").split(File.pathSeparator)) {
      Path p=Path.of(path).resolve(exe);if(Files.isExecutable(p))return p;
    }
    Path pg=Path.of("C:/Program Files/PostgreSQL");
    if(Files.isDirectory(pg))try(var versions=Files.list(pg)) {
      return versions.filter(p->p.getFileName().toString().matches("\\d+"))
          .sorted(Comparator.comparingInt((Path p)->Integer.parseInt(p.getFileName().toString())).reversed())
          .map(p->p.resolve("bin/pg_dump.exe")).filter(Files::isExecutable).findFirst().orElse(Path.of(exe));
    }catch(IOException ignored){}
    return Path.of(exe);
  }
  public Item create() throws IOException {
    check(busy.compareAndSet(false,true),"백업을 생성하고 있습니다. 잠시 후 확인해주세요.");
    Path dump=null,partial=null;
    try {
      Files.createDirectories(directory);
      dump=Files.createTempFile(directory,"dump-",".tmp");
      partial=Files.createTempFile(directory,"archive-",".tmp");
      dumpDatabase(dump);
      List<Map<String,Object>> entries=new ArrayList<>();
      try(var zip=new ZipOutputStream(Files.newOutputStream(partial))) {
        add(zip,"database.dump",Files.newInputStream(dump),entries);
        for(String resource:List.of("restore-backup.py","RESTORE.txt"))
          add(zip,resource,new ClassPathResource("backup/"+resource).getInputStream(),entries);
        if(Files.exists(receipts)) {
          check(!Files.isSymbolicLink(receipts),"전표 폴더의 연결 경로는 백업할 수 없습니다.");
          try(var paths=Files.walk(receipts)) {
            for(Path path:paths.toList()) {
              check(!Files.isSymbolicLink(path),"전표 폴더의 연결 파일은 백업할 수 없습니다.");
              if(Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS)&&path.toString().endsWith(".json"))
                add(zip,"data/kb-card/"+receipts.relativize(path).toString().replace('\\','/'),Files.newInputStream(path),entries);
            }
          }
        }
        zip.putNextEntry(new ZipEntry("manifest.json"));
        zip.write(json.writeValueAsBytes(Map.of("format","asset-manager-backup","version",1,"createdAt",Instant.now().toString(),"files",entries)));
        zip.closeEntry();
      }
      Path target=directory.resolve("backup-"+UUID.randomUUID()+".zip");
      Files.move(partial,target,StandardCopyOption.ATOMIC_MOVE);
      return item(target);
    } finally {
      try {if(dump!=null)Files.deleteIfExists(dump);if(partial!=null)Files.deleteIfExists(partial);}
      finally{busy.set(false);}
    }
  }
  static void add(ZipOutputStream zip,String name,InputStream input,List<Map<String,Object>> entries)throws IOException {
    try(input) {
      MessageDigest digest;
      try{digest=MessageDigest.getInstance("SHA-256");}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
      zip.putNextEntry(new ZipEntry(name));long count=0;byte[] buffer=new byte[65536];int n;
      while((n=input.read(buffer))!=-1){zip.write(buffer,0,n);digest.update(buffer,0,n);count+=n;}
      zip.closeEntry();entries.add(Map.of("path",name,"bytes",count,"sha256",HexFormat.of().formatHex(digest.digest())));
    }
  }
  protected void dumpDatabase(Path target)throws IOException {
    Path executable=dumpTool();check(Files.isExecutable(executable),"PostgreSQL pg_dump 실행 파일을 찾지 못했습니다.");
    check(url.startsWith("jdbc:postgresql://"),"백업은 PostgreSQL 서버 연결 주소가 필요합니다.");
    URI uri=URI.create(url.substring(5));
    check(uri.getHost()!=null&&uri.getPath()!=null&&uri.getPath().length()>1&&uri.getUserInfo()==null,"DB 연결 주소를 확인해주세요.");
    // libpq must not silently ignore JDBC-only SSL settings.
    check(uri.getQuery()==null,"백업용 DB 주소에는 JDBC 옵션을 사용할 수 없습니다. 연결 설정을 확인해주세요.");
    var command=List.of(executable.toString(),"--format=custom","--no-owner","--no-acl","--no-password",
        "--host",uri.getHost(),"--port",String.valueOf(uri.getPort()<0?5432:uri.getPort()),
        "--username",user,"--dbname",uri.getPath().substring(1),"--file",target.toString());
    var builder=new ProcessBuilder(command).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD);
    builder.environment().put("PGPASSWORD",password);builder.environment().put("PGCONNECT_TIMEOUT","10");
    Process process=builder.start();
    try {
      if(!process.waitFor(180,TimeUnit.SECONDS)){process.destroyForcibly();process.waitFor();throw new BusinessException("백업 시간이 초과되었습니다. DB 연결과 용량을 확인해주세요.");}
      check(process.exitValue()==0&&Files.size(target)>0,"DB 백업에 실패했습니다. 연결 권한과 pg_dump 버전을 확인해주세요.");
    }catch(InterruptedException e){process.destroyForcibly();Thread.currentThread().interrupt();throw new IOException("백업이 중단되었습니다.");}
  }
}
