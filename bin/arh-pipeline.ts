#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { rootStack } from '../lib/arh-pipeline-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();
new rootStack(app);

Aspects.of(app).add(new AwsSolutionsChecks());

