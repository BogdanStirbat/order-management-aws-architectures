package com.order.management.lambdadynamodb.config;

public record AppConfig(String ordersTableName) {

  public static AppConfig fromEnv() {
    String tableName = required("ORDERS_TABLE_NAME");

    return new AppConfig(tableName);
  }

  private static String required(String name) {
    String value = System.getenv(name);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Missing environment variable: " + name);
    }
    return value;
  }

}
