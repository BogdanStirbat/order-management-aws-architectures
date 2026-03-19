import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { OrdersAppConfig } from "./config";

import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as cdk from 'aws-cdk-lib';

export interface EcrRepositoryProps extends StackProps {
  config: OrdersAppConfig;
}

export class EcrRepositoryStack extends Stack {

  public readonly appRepository: ecr.Repository;
  public readonly adotRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrRepositoryProps) {
    super(scope, id, props);

    const { config } = props;

    this.appRepository = new ecr.Repository(this, 'AppRepository', {
      repositoryName: config.ecrRepositoryName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true
    });

    this.adotRepository = new ecr.Repository(this, 'AdotRepository', {
      repositoryName: config.ecrRepositoryName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true
    });

    new cdk.CfnOutput(this, 'AppRepositoryUri', {
      value: this.appRepository.repositoryUri
    });

    new cdk.CfnOutput(this, 'AdotRepositoryUri', {
      value: this.adotRepository.repositoryUri
    });
  }
}