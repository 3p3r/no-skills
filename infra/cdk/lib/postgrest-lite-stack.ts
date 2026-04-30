import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

export class PostgrestLiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new lambda.DockerImageFunction(this, "PostgrestLiteFunction", {
      code: lambda.DockerImageCode.fromImageAsset(process.cwd()),
      architecture: lambda.Architecture.X86_64,
      memorySize: 2048,
      timeout: cdk.Duration.seconds(30),
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
      environment: {
        POSTGREST_LITE_HOST: "0.0.0.0",
        POSTGREST_LITE_PORT: "8080",
        AWS_LWA_PORT: "8080",
        AWS_LWA_READINESS_CHECK_PATH: "/ready",
      },
    });

    new logs.LogGroup(this, "PostgrestLiteFunctionLogGroup", {
      logGroupName: `/aws/lambda/${fn.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const url = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, "FunctionUrl", {
      value: url.url,
    });

    new cdk.CfnOutput(this, "FunctionName", {
      value: fn.functionName,
    });
  }
}
