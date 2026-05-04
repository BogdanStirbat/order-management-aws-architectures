package com.order.management.lambdaaurora.db.credentials;

import com.order.management.lambdaaurora.config.DbConfig;
import java.time.Duration;
import java.time.Instant;

public class CachedDbCredentialsProvider {

  private final SecretsManagerDbCredentialsProvider delegate;
  private final Duration ttl;

  private volatile DbCredentials cached;
  private volatile Instant expiresAt = Instant.EPOCH;

  public CachedDbCredentialsProvider(DbConfig dbConfig, Duration ttl) {
    this.delegate = new SecretsManagerDbCredentialsProvider(dbConfig);
    this.ttl = ttl;
  }

  public DbCredentials getCredentials() {
    Instant now = Instant.now();

    DbCredentials current = cached;
    if (current != null && now.isBefore(expiresAt)) {
      return current;
    }

    synchronized (this) {
      if (cached != null && Instant.now().isBefore(expiresAt)) {
        return cached;
      }

      cached = delegate.getCredentials();
      expiresAt = Instant.now().plus(ttl);

      return cached;
    }
  }

  public DbCredentials refreshNow() {
    synchronized (this) {
      return refreshNowLocked();
    }
  }

  private DbCredentials refreshNowLocked() {
    cached = delegate.getCredentials();
    expiresAt = Instant.now().plus(ttl);
    return cached;
  }
}
