package com.order.management.lambdaaurora.db.credentials;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.order.management.lambdaaurora.config.DbConfig;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;

public class SecretsManagerDbCredentialsProvider {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final DbConfig dbConfig;
  private final SecretsManagerClient secretsManager;

  public SecretsManagerDbCredentialsProvider(DbConfig dbConfig) {
    this(dbConfig, SecretsManagerClient.create());
  }

  SecretsManagerDbCredentialsProvider(
      DbConfig dbConfig,
      SecretsManagerClient secretsManager
  ) {
    this.dbConfig = dbConfig;
    this.secretsManager = secretsManager;
  }

  public DbCredentials getCredentials() {
    try {
      String secretString = secretsManager.getSecretValue(
          GetSecretValueRequest.builder()
              .secretId(dbConfig.secretArn())
              .build()
      ).secretString();

      if (secretString == null || secretString.isBlank()) {
        throw new IllegalStateException("Database secret has no SecretString");
      }

      JsonNode root = MAPPER.readTree(secretString);

      String username = required(root, "username");
      String password = required(root, "password");

      return new DbCredentials(username, password);

    } catch (Exception ex) {
      throw new IllegalStateException("Failed to read database credentials from Secrets Manager", ex);
    }
  }

  private static String required(JsonNode root, String field) {
    JsonNode value = root.get(field);

    if (value == null || value.asText().isBlank()) {
      throw new IllegalStateException("Database secret is missing field: " + field);
    }

    return value.asText();
  }
}