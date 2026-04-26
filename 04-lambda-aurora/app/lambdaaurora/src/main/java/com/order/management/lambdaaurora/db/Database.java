package com.order.management.lambdaaurora.db;

import javax.sql.DataSource;
import org.postgresql.ds.PGSimpleDataSource;

public class Database {

  private static final DataSource DATA_SOURCE = createDataSource();

  private Database() { }

  public static DataSource dataSource() {
    return DATA_SOURCE;
  }

  private static DataSource createDataSource() {
    PGSimpleDataSource ds = new PGSimpleDataSource();

    ds.setServerNames(new String[] { env("DB_HOST") });
    ds.setPortNumbers(new int[] { Integer.parseInt(env("DB_PORT", "5432")) });
    ds.setDatabaseName(env("DB_NAME"));
    ds.setUser(env("DB_USERNAME"));
    ds.setPassword(env("DB_PASSWORD"));
    ds.setSslMode("require");

    return ds;
  }

  private static String env(String name) {
    String value = System.getenv(name);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Missing environment variable: " + name);
    }
    return value;
  }

  private static String env(String name, String fallback) {
    String value = System.getenv(name);
    return value == null || value.isBlank() ? fallback : value;
  }
}
