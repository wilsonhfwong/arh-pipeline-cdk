# ARH Pipeline CDK

AWS CDK project for AWS Resilience Hub (ARH) pipeline implementation.

## Overview

This project creates a CI/CD pipeline that integrates with AWS Resilience Hub for application assessment and resilience evaluation.

## Architecture

- **CodeCommit Repository**: Source code repository
- **CodeBuild**: Build and synthesis of CDK applications
- **CodePipeline**: Orchestrates the deployment pipeline
- **Step Functions**: Executes resilience assessments
- **SNS**: Notifications for assessment failures

## Prerequisites

- AWS CLI configured
- Node.js 18.x
- AWS CDK CLI

## Deployment

```bash
npm install
cdk bootstrap
cdk deploy
```

## Usage

The pipeline automatically triggers on code commits and performs:
1. Source code checkout
2. CDK synthesis and asset publishing
3. CloudFormation deployment
4. AWS Resilience Hub assessment