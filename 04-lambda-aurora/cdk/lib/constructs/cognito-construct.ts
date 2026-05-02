import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class CognitoConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

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