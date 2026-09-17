package com.family.asset.service;

import com.family.asset.exception.BusinessException;
import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import tools.jackson.databind.ObjectMapper;

/** One local browser session, with no cookie/PIN serialization or network listener. */
@Service
public class KbBrowserService {
  private final ObjectMapper json;
  private final String node;
  private final Path script;
  private Process process;
  private BufferedWriter input;
  private BufferedReader output;
  public KbBrowserService(ObjectMapper json,
      @Value("${kb-card.node:node}") String node,
      @Value("${kb-card.bridge:tools/kb-card/bridge.cjs}") String script) {
    this.json = json; this.node = node; this.script = Path.of(script).toAbsolutePath();
  }
  @EventListener(ApplicationReadyEvent.class)
  public void reconnectRegisteredChrome() {
    if (Files.isRegularFile(Path.of(".local/kb-card-pairing.json"))) {
      Thread.ofVirtual().start(() -> {
        try { call(Map.of("action", "connect")); }
        catch (BusinessException ignored) { /* The import UI reports setup/connection errors on demand. */ }
      });
    }
  }
  public synchronized Object call(Map<String, Object> request) {
    try {
      if (process == null || !process.isAlive()) {
        if (!Files.isRegularFile(script)) throw new BusinessException("KB 가져오기 도구가 없습니다. docs/KB_CARD_IMPORT.md의 설치 안내를 확인해주세요.");
        String executable = node;
        // Development fallback; deployments should explicitly set kb-card.node.
        Path portable = Path.of("build/test-tools/node-v24.19.0-win-x64/node.exe").toAbsolutePath();
        if (node.equals("node") && Files.isRegularFile(portable)) executable = portable.toString();
        process = new ProcessBuilder(executable, script.toString())
            .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        input = process.outputWriter(StandardCharsets.UTF_8);
        output = process.inputReader(StandardCharsets.UTF_8);
      }
      input.write(json.writeValueAsString(request)); input.newLine(); input.flush();
      BufferedReader reader = output;
      FutureTask<String> result = new FutureTask<>(reader::readLine);
      Thread.ofVirtual().start(result);
      String line = result.get(45, TimeUnit.SECONDS);
      if (line == null || line.length() > 12 * 1024 * 1024) throw new IOException();
      var reply = json.readTree(line);
      if (!reply.path("ok").asBoolean()) throw new BusinessException(reply.path("message").asText());
      return reply.get("result");
    } catch (BusinessException e) { throw e; }
    catch (Exception e) {
      if (e instanceof InterruptedException) Thread.currentThread().interrupt();
      close();
      throw new BusinessException("KB 가져오기 도구에 연결하지 못했습니다. Node.js와 의존성 설치를 확인한 뒤 브라우저를 다시 열어주세요.");
    }
  }
  public Object openExistingChrome() {
    // No --user-data-dir or debugging flags: Chrome selects its normal profile/session.
    List<Path> candidates = new ArrayList<>();
    for (String variable : List.of("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")) {
      String root = System.getenv(variable);
      if (root != null) candidates.add(Path.of(root, "Google", "Chrome", "Application", "chrome.exe"));
    }
    String executable = candidates.stream().filter(Files::isRegularFile).findFirst()
        .map(Path::toString).orElse("google-chrome");
    try {
      new ProcessBuilder(executable, "--new-tab", "https://card.kbcard.com/")
          .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
      return Map.of("opened", true, "mode", "existing-profile");
    } catch (IOException e) {
      throw new BusinessException("Chrome을 열지 못했습니다. 평소 사용하는 Chrome에서 KB국민카드 홈페이지를 직접 열어주세요.");
    }
  }
  public Object latestCollection() {
    Path directory = Path.of("data/kb-card").toAbsolutePath();
    try {
      if (!Files.isDirectory(directory)) throw new BusinessException("저장된 수집 결과가 없습니다.");
      try (var files = Files.list(directory)) {
        Path latest = files.filter(Files::isRegularFile).filter(p -> p.getFileName().toString().matches("kb-[A-Za-z0-9.-]+\\.json"))
            .max(Comparator.comparing(p -> p.getFileName().toString())).orElseThrow(() -> new BusinessException("저장된 수집 결과가 없습니다."));
        if (Files.size(latest) > 50 * 1024 * 1024) throw new BusinessException("수집 파일이 너무 큽니다.");
        var result = json.readTree(Files.readString(latest));
        if (!"asset-manager-kb-collection".equals(result.path("format").asText()) || !result.path("complete").asBoolean())
          throw new BusinessException("완료된 수집 결과를 확인하지 못했습니다.");
        return result;
      }
    } catch (IOException e) { throw new BusinessException("수집 결과를 읽지 못했습니다."); }
  }
  @PreDestroy
  public synchronized void close() {
    if (process != null) {
      try { input.close(); if (!process.waitFor(3, TimeUnit.SECONDS)) process.destroy(); }
      catch (Exception ignored) { process.destroy(); }
      process = null;
    }
  }
}
