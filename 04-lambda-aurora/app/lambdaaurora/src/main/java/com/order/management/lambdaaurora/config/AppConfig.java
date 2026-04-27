package com.order.management.lambdaaurora.config;

public record AppConfig(DbConfig db) {

  public static AppConfig fromEnv() {
    return new AppConfig(
        new DbConfig(
            required("DB_HOST"),
            Integer.parseInt(optional("DB_PORT", "5432")),
            required("DB_NAME"),
            required("DB_USERNAME"),
            required("DB_PASSWORD")
        )
    );
  }

  private static String required(String name) {
    String value = System.getenv(name);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Missing environment variable: " + name);
    }
    return value;
  }

  private static String optional(String name, String fallback) {
    String value = System.getenv(name);
    return value == null || value.isBlank() ? fallback : value;
  }
}
