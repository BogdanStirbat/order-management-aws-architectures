package com.order.management.lambdaaurora.db;

import com.order.management.lambdaaurora.config.AppConfig;
import com.order.management.lambdaaurora.db.credentials.SecretsManagerDataSource;
import javax.sql.DataSource;

public class Database {

  private Database() { }

  public static DataSource createDataSource(AppConfig appConfig) {

    return new SecretsManagerDataSource(appConfig);
  }
}
