import { Stack, StackProps, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import type { OrdersAppConfig } from "./config";

export interface EcrRepositoryProps extends StackProps {
  config: OrdersAppConfig;
}

export class EcrRepositoryStack extends Stack {
  public readonly appRepository: ecr.Repository;
  public readonly adotRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrRepositoryProps) {
    super(scope, id, props);

    this.appRepository = new ecr.Repository(this, "AppRepository", {
      repositoryName: props.config.appEcrRepositoryName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    this.adotRepository = new ecr.Repository(this, "AdotRepository", {
      repositoryName: props.config.adotEcrRepositoryName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    new CfnOutput(this, "AppRepositoryUri", { value: this.appRepository.repositoryUri });
    new CfnOutput(this, "AdotRepositoryUri", { value: this.adotRepository.repositoryUri });
  }
}
