package com.order.management.lambdaaurora.db;

import com.order.management.lambdaaurora.config.AppConfig;
import javax.sql.DataSource;
import org.postgresql.ds.PGSimpleDataSource;

public class Database {

  private Database() { }

  public static DataSource createDataSource(AppConfig appConfig) {
    PGSimpleDataSource ds = new PGSimpleDataSource();

    ds.setServerNames(new String[] { appConfig.db().host() });
    ds.setPortNumbers(new int[] { appConfig.db().port() });
    ds.setDatabaseName( appConfig.db().name() );
    ds.setUser( appConfig.db().username() );
    ds.setPassword( appConfig.db().password() );
    ds.setSslMode("require");

    return ds;
  }
}
