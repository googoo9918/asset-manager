import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.regex.*;
import org.yaml.snakeyaml.Yaml;

/** Idempotent additive migration; never changes financial balances. */
class ApplyStockOrderMigration {
  @SuppressWarnings("unchecked")
  static Map<String,Object> datasource(Path path) throws Exception {
    if (!Files.isRegularFile(path)) return Map.of();
    try (var input=Files.newInputStream(path)) {
      Object loaded=new Yaml().load(input);
      if (!(loaded instanceof Map<?,?> root) || !(root.get("spring") instanceof Map<?,?> spring)
          || !(spring.get("datasource") instanceof Map<?,?> source)) return Map.of();
      return (Map<String,Object>)source;
    }
  }
  static String value(Map<String,Object> settings,String key) {
    var matcher=Pattern.compile("\\$\\{([^:}]+)(?::([^}]*))?}").matcher(String.valueOf(settings.getOrDefault(key,"")));
    var result=new StringBuffer();
    while(matcher.find()) matcher.appendReplacement(result,Matcher.quoteReplacement(System.getenv().getOrDefault(matcher.group(1),Objects.requireNonNullElse(matcher.group(2),""))));
    matcher.appendTail(result);return result.toString();
  }
  public static void main(String[] args) throws Exception {
    var settings=new HashMap<>(datasource(Path.of("src/main/resources/application.yml")));
    settings.putAll(datasource(Path.of("application-local.yml")));
    try(var connection=DriverManager.getConnection(value(settings,"url"),value(settings,"username"),value(settings,"password"))) {
      connection.setAutoCommit(false);
      try(var statement=connection.createStatement()) {
        statement.execute("SET LOCAL lock_timeout = '5s'");
        statement.execute(Files.readString(Path.of("db/migrate_stock_orders.sql")));
        connection.commit();
      }
      System.out.println("Stock order schema is ready.");
    } catch(SQLException e) {
      System.err.println("Stock order migration failed. SQL state: "+e.getSQLState());System.exit(1);
    }
  }
}
