import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";

const secrets = new SecretsManagerClient({});

type Event = {
  RequestType: "Create" | "Update" | "Delete";
  ResourceProperties: {
    SecretArn: string;
    DbHost: string;
    DbPort: string;
    DbName: string;
    MigrationSql: string;
    MigrationHash: string;
  };
};

export const handler = async (event: Event) => {
  console.log(JSON.stringify({ requestType: event.RequestType }));

  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: "orders-db-migration"
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
    await client.query("BEGIN");
    await client.query(props.MigrationSql);
    await client.query("COMMIT");

    console.log("Migration completed successfully");

    return {
      PhysicalResourceId: `orders-db-migration-${props.MigrationHash}`
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed", err);
    throw err;
  } finally {
    await client.end();
  }
};