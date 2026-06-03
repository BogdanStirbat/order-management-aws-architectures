import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class DynamoDbStack extends Stack {
  public readonly table: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.TableV2(this, "OrdersTable", {
      tableName: "orders-app",
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: RemovalPolicy.DESTROY, // dev-friendly
      globalSecondaryIndexes: [
        {
          indexName: "GSI1",
          partitionKey: {
            name: "gsi1pk",
            type: dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: "gsi1sk",
            type: dynamodb.AttributeType.STRING,
          },
        },
        {
          indexName: "GSI2",
          partitionKey: {
            name: "gsi2pk",
            type: dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: "gsi2sk",
            type: dynamodb.AttributeType.STRING,
          },
        },
      ],
    });

    new cdk.CfnOutput(this, "OrdersTableName", {
      value: this.table.tableName,
    });
  }
}