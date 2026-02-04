import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class CognitoStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "OrdersUserPool", {
      userPoolName: "orders-app-users",
      selfSignUpEnabled: false,          // new users are created by the account owner 
      signInAliases: { email: true },
    });

    this.userPoolClient = this.userPool.addClient("OrdersApiClient", {
      generateSecret: false, // typical for public clients
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });
  }
}
