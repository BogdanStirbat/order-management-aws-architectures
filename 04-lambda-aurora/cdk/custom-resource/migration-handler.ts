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
  PhysicalResourceId?: string;
  ResourceProperties: {
    SecretArn: string;
    DbHost: string;
    DbPort: string;
    DbName: string;
    MigrationsJson: string;
    MigrationsHash: string;
  };
};

const PHYSICAL_RESOURCE_ID = "orders-db-migrations";

const MIGRATION_LOCK_ID = 2026010401;

async function acquireMigrationLock(client: Client) {
  const result = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [MIGRATION_LOCK_ID]
  );

  if (!result.rows[0].locked) {
    throw new Error("Could not acquire migration lock. Another migration may be running.");
  }

  console.log("Migration lock acquired");
}

async function releaseMigrationLock(client: Client) {
  await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
  console.log("Migration lock released");
}

async function ensureSchemaMigrationsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      installed_rank INTEGER PRIMARY KEY,
      version INTEGER NOT NULL UNIQUE,
      description TEXT NOT NULL,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      installed_by TEXT NOT NULL DEFAULT current_user,
      installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_time_ms INTEGER NOT NULL,
      success BOOLEAN NOT NULL
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_success
    ON schema_migrations(success)
  `);
}

function validateMigrationFiles(migrations: Migration[]) {
  if (migrations.length === 0) {
    throw new Error("No migration files found");
  }

  const seenVersions = new Set<number>();

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Invalid migration version in ${migration.filename}`);
    }

    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }

    seenVersions.add(migration.version);

    const expectedChecksum = crypto
      .createHash("sha256")
      .update(migration.sql)
      .digest("hex");

    if (expectedChecksum !== migration.checksum) {
      throw new Error(`Checksum mismatch inside migration payload: ${migration.filename}`);
    }
  }

  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (let i = 0; i < migrations.length; i++) {
    if (migrations[i].version !== sorted[i].version) {
      throw new Error("MigrationsJson must be sorted by version");
    }
  }
}

async function validateAppliedMigrations(client: Client, migrations: Migration[]) {
  const result = await client.query<{
    version: number;
    checksum: string;
    success: boolean;
  }>(`
    SELECT version, checksum, success
    FROM schema_migrations
    ORDER BY version ASC
  `);

  const availableByVersion = new Map<number, Migration>();

  for (const migration of migrations) {
    availableByVersion.set(migration.version, migration);
  }

  for (const applied of result.rows) {
    if (!applied.success) {
      throw new Error(
        `Migration version ${applied.version} previously failed. Manual repair required.`
      );
    }

    const local = availableByVersion.get(applied.version);

    if (!local) {
      throw new Error(
        `Database has applied migration V${applied.version}, but this file is missing locally.`
      );
    }

    if (local.checksum !== applied.checksum) {
      throw new Error(
        `Migration V${applied.version} checksum changed after it was applied.`
      );
    }
  }
}

async function recordFailedMigration(
  client: Client,
  migration: Migration,
  installedRank: number,
  executionTimeMs: number
) {
  try {
    await client.query(
      `
      INSERT INTO schema_migrations(
        installed_rank,
        version,
        description,
        filename,
        checksum,
        execution_time_ms,
        success
      )
      VALUES ($1, $2, $3, $4, $5, $6, false)
      ON CONFLICT (version) DO NOTHING
      `,
      [
        installedRank,
        migration.version,
        migration.description,
        migration.filename,
        migration.checksum,
        executionTimeMs
      ]
    );
  } catch (recordErr) {
    console.error("Failed to record failed migration", recordErr);
  }
}

async function applyMigration(client: Client, migration: Migration) {
  console.log(`Applying migration ${migration.filename}`);

  const start = Date.now();

  const rankResult = await client.query<{ next_rank: number }>(`
    SELECT COALESCE(MAX(installed_rank), 0) + 1 AS next_rank
    FROM schema_migrations
  `);

  const installedRank = rankResult.rows[0].next_rank;

  await client.query("BEGIN");

  try {
    await client.query(migration.sql);

    const executionTimeMs = Date.now() - start;

    await client.query(
      `
      INSERT INTO schema_migrations(
        installed_rank,
        version,
        description,
        filename,
        checksum,
        execution_time_ms,
        success
      )
      VALUES ($1, $2, $3, $4, $5, $6, true)
      `,
      [
        installedRank,
        migration.version,
        migration.description,
        migration.filename,
        migration.checksum,
        executionTimeMs
      ]
    );

    await client.query("COMMIT");

    console.log(`Applied migration ${migration.filename} in ${executionTimeMs}ms`);
  } catch (err) {
    await client.query("ROLLBACK");

    await recordFailedMigration(client, migration, installedRank, Date.now() - start);

    console.error(`Migration failed: ${migration.filename}`, err);
    throw err;
  }
}

async function applyPendingMigrations(client: Client, migrations: Migration[]) {
  const appliedResult = await client.query<{ version: number }>(`
    SELECT version
    FROM schema_migrations
    WHERE success = true
  `);

  const appliedVersions = new Set(
    appliedResult.rows.map((row) => row.version)
  );

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      console.log(`Skipping applied migration: ${migration.filename}`);
      continue;
    }

    await applyMigration(client, migration);
  }
}

export const handler = async (event: Event) => {
  console.log(JSON.stringify({
    requestType: event.RequestType,
    physicalResourceId: event.PhysicalResourceId
  }));

  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: PHYSICAL_RESOURCE_ID
    };
  }

  const props = event.ResourceProperties;
  const migrations: Migration[] = JSON.parse(props.MigrationsJson);

  validateMigrationFiles(migrations);

  const secret = await readSecret(props.SecretArn);

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
    await acquireMigrationLock(client);

    try {
      await ensureSchemaMigrationsTable(client);
      await validateAppliedMigrations(client, migrations);
      await applyPendingMigrations(client, migrations);
    } finally {
      await releaseMigrationLock(client);
    }

    return {
      PhysicalResourceId: PHYSICAL_RESOURCE_ID
    };
  } finally {
    await client.end();
  }
};

async function readSecret(secretArn: string): Promise<{ username: string; password: string }> {
  const response = await secrets.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error("Database secret has no SecretString");
  }

  return JSON.parse(response.SecretString);
}