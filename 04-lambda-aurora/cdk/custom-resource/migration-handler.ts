import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";
import * as crypto from "crypto";

const secrets = new SecretsManagerClient({});

type Migration = {
  version: number;
  description: string;
  filename: string;
  sql: string;
  checksum: string;
};

type Event = {
  RequestType: "Create" | "Update" | "Delete";
  ResourceProperties: {
    SecretArn: string;
    DbHost: string;
    DbPort: string;
    DbName: string;
    MigrationsJson: string;
    MigrationsHash: string;
  };
};

export const handler = async (event: Event) => {
  console.log(JSON.stringify({ requestType: event.RequestType }));

  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: "orders-db-migrations"
    };
  }

  const props = event.ResourceProperties;

  const secretResponse = await secrets.send(
    new GetSecretValueCommand({ SecretId: props.SecretArn })
  );

  if (!secretResponse.SecretString) {
    throw new Error("Database secret has no SecretString");
  }

  const secret = JSON.parse(secretResponse.SecretString);

  const migrations: Migration[] = JSON.parse(props.MigrationsJson);

  validateMigrations(migrations);

  const client = new Client({
    host: props.DbHost,
    port: Number(props.DbPort),
    database: props.DbName,
    user: secret.username,
    password: secret.password,
    ssl: {
      rejectUnauthorized: false
    }
  });

  await client.connect();

  try {
    await ensureMigrationTable(client);
    await applyPendingMigrations(client, migrations);

    return {
      PhysicalResourceId: "orders-db-migrations"
    };
  } finally {
    await client.end();
  }
};

async function ensureMigrationTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function applyPendingMigrations(client: Client, migrations: Migration[]) {
  const appliedResult = await client.query<{
    version: number;
    checksum: string;
  }>(`
    SELECT version, checksum
    FROM schema_migrations
    ORDER BY version ASC
  `);

  const applied = new Map<number, string>();

  for (const row of appliedResult.rows) {
    applied.set(row.version, row.checksum);
  }

  for (const migration of migrations) {
    const existingChecksum = applied.get(migration.version);

    if (existingChecksum) {
      if (existingChecksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.filename} was already applied but its checksum changed`
        );
      }

      console.log(`Skipping already applied migration: ${migration.filename}`);
      continue;
    }

    console.log(`Applying migration: ${migration.filename}`);

    await client.query("BEGIN");

    try {
      await client.query(migration.sql);

      await client.query(
        `
        INSERT INTO schema_migrations(version, description, checksum)
        VALUES ($1, $2, $3)
        `,
        [migration.version, migration.description, migration.checksum]
      );

      await client.query("COMMIT");

      console.log(`Applied migration: ${migration.filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Failed migration: ${migration.filename}`, err);
      throw err;
    }
  }
}

function validateMigrations(migrations: Migration[]) {
  const seen = new Set<number>();

  for (const migration of migrations) {
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }

    seen.add(migration.version);

    const expectedChecksum = crypto
      .createHash("sha256")
      .update(migration.sql)
      .digest("hex");

    if (expectedChecksum !== migration.checksum) {
      throw new Error(`Invalid checksum for migration: ${migration.filename}`);
    }
  }
}