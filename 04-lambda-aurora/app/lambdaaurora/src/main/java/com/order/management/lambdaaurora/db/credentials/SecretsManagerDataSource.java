package com.order.management.lambdaaurora.db.credentials;

import com.order.management.lambdaaurora.config.AppConfig;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import java.sql.SQLFeatureNotSupportedException;
import java.util.logging.Logger;
import javax.sql.DataSource;
import org.postgresql.ds.PGSimpleDataSource;

public class SecretsManagerDataSource implements DataSource {

  private final AppConfig appConfig;
  private final CachedDbCredentialsProvider credentialsProvider;

  public SecretsManagerDataSource(AppConfig appConfig) {
    this.appConfig = appConfig;
    this.credentialsProvider = new CachedDbCredentialsProvider(
        appConfig.db(),
        Duration.ofMinutes(5)
    );
  }

  @Override
  public Connection getConnection() throws SQLException {
    DbCredentials credentials = credentialsProvider.getCredentials();

    try {
      return createDelegate(credentials).getConnection();

    } catch (SQLException ex) {
      if (!isAuthenticationFailure(ex)) {
        throw ex;
      }

      DbCredentials refreshed = credentialsProvider.refreshNow();

      return createDelegate(refreshed).getConnection();
    }
  }

  private PGSimpleDataSource createDelegate(DbCredentials credentials) {
    PGSimpleDataSource ds = new PGSimpleDataSource();

    ds.setServerNames(new String[] { appConfig.db().host() });
    ds.setPortNumbers(new int[] { appConfig.db().port() });
    ds.setDatabaseName(appConfig.db().name());

    ds.setUser(credentials.username());
    ds.setPassword(credentials.password());

    ds.setSslMode("require");
    ds.setConnectTimeout(5);
    ds.setSocketTimeout(10);
    ds.setLoginTimeout(5);

    return ds;
  }

  private boolean isAuthenticationFailure(SQLException ex) {
    SQLException current = ex;

    while (current != null) {
      String sqlState = current.getSQLState();

      if (sqlState != null && sqlState.startsWith("28")) {
        return true;
      }

      current = current.getNextException();
    }

    return false;
  }

  @Override
  public Connection getConnection(String username, String password) throws SQLException {
    throw new SQLFeatureNotSupportedException("Explicit credentials are not supported");
  }

  @Override
  public PrintWriter getLogWriter() {
    return null;
  }

  @Override
  public void setLogWriter(PrintWriter printWriter) {

  }

  @Override
  public void setLoginTimeout(int seconds) {

  }

  @Override
  public int getLoginTimeout() {
    return 5;
  }

  @Override
  public Logger getParentLogger() throws SQLFeatureNotSupportedException {
    throw new SQLFeatureNotSupportedException();
  }

  @Override
  public <T> T unwrap(Class<T> aClass) throws SQLException {
    throw new SQLFeatureNotSupportedException();
  }

  @Override
  public boolean isWrapperFor(Class<?> aClass) {
    return false;
  }
}
