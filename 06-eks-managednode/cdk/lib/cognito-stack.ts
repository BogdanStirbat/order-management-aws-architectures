import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class CognitoStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly issuerUri: string;
  public readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "OrdersUserPool", {
      userPoolName: "orders-app-eks-users",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
    });

    this.userPoolClient = this.userPool.addClient("OrdersApiClient", {
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    this.issuerUri = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`;
    this.userPoolClientId = this.userPoolClient.userPoolClientId;
  }
}
