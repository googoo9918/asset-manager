import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.regex.*;
import org.yaml.snakeyaml.Yaml;

/** Explicit, idempotent schema setup using the same local datasource configuration as the app. */
class ApplyKbMigration {
  @SuppressWarnings("unchecked")
  static Map<String,Object> datasource(Path path) throws Exception {
    if(!Files.isRegularFile(path))return Map.of();
    try(var input=Files.newInputStream(path)){
      Object loaded=new Yaml().load(input);
      if(!(loaded instanceof Map<?,?> root)||!(root.get("spring") instanceof Map<?,?> spring)||!(spring.get("datasource") instanceof Map<?,?> source))return Map.of();
      return (Map<String,Object>)source;
    }
  }
  static String value(Map<String,Object> settings,String key){
    String value=String.valueOf(settings.getOrDefault(key,""));
    Matcher matcher=Pattern.compile("\\$\\{([^:}]+)(?::([^}]*))?}").matcher(value);
    StringBuffer result=new StringBuffer();
    while(matcher.find())matcher.appendReplacement(result,Matcher.quoteReplacement(System.getenv().getOrDefault(matcher.group(1),Objects.requireNonNullElse(matcher.group(2),""))));
    matcher.appendTail(result);return result.toString();
  }
  public static void main(String[] args) throws Exception {
    var settings=new HashMap<>(datasource(Path.of("src/main/resources/application.yml")));
    settings.putAll(datasource(Path.of("application-local.yml")));
    try(var connection=DriverManager.getConnection(value(settings,"url"),value(settings,"username"),value(settings,"password"))){
      connection.setAutoCommit(false);
      try(var statement=connection.createStatement()){
        statement.execute(Files.readString(Path.of("db/migrate_kb_card_import.sql")));
        if(args.length == 1) {
          // Optional explicit first-time point-card mapping; never creates ledger entries or changes balances.
          var mapping = new Properties();
          try(var reader=Files.newBufferedReader(Path.of(args[0]))) { mapping.load(reader); }
          try(var insert=connection.prepareStatement("""
              INSERT INTO kb_card_mapping(source_card,card_id,account_id,point_payment)
              SELECT ?,c.id,a.id,true FROM payment_card c JOIN asset_account a ON c.account_id=a.id
              WHERE c.card_name=? AND a.account_name=? AND c.card_type='DEBIT'
                AND c.status='ACTIVE' AND a.status='ACTIVE' AND a.asset_type='CASH'
              ON CONFLICT(source_card) DO UPDATE SET source_card=excluded.source_card
                WHERE kb_card_mapping.card_id=excluded.card_id
                  AND kb_card_mapping.account_id=excluded.account_id AND kb_card_mapping.point_payment
              RETURNING card_id
              """)) {
            insert.setString(1,Objects.requireNonNull(mapping.getProperty("sourceCard")));
            insert.setString(2,Objects.requireNonNull(mapping.getProperty("cardName")));
            insert.setString(3,Objects.requireNonNull(mapping.getProperty("accountName")));
            try(var result=insert.executeQuery()) {
              if(!result.next() || result.next())throw new SQLException("Expected exactly one matching mapping");
            }
          }
          System.out.println("Point-card mapping verified and saved.");
        }
        connection.commit();
      }
      System.out.println("KB import identity table is ready.");
    }catch(SQLException e){
      System.err.println("KB schema setup failed. Check local datasource settings and DB permissions. SQL state: "+e.getSQLState());
      System.exit(1);
    }
  }
}
