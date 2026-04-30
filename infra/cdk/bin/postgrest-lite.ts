#!/usr/bin/env node

import * as cdk from "aws-cdk-lib";

import { PostgrestLiteStack } from "../lib/postgrest-lite-stack";

const app = new cdk.App();

new PostgrestLiteStack(app, "PostgrestLiteStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
