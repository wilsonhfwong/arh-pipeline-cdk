
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';


export class rootStack extends cdk.Stack {
  constructor(scope: Construct) {
    super(scope, 'ARH-Workshop');

    new AppArhPipeline(this, 'Pipeline',{
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT!, 
        region: process.env.CDK_DEFAULT_REGION!
      }
    });
  }
}

interface AppArhPipelineStackProps extends cdk.NestedStackProps {
  readonly env?: {
    account: string,
    region: string
  }
}

export class AppArhPipeline extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props?: AppArhPipelineStackProps ) {
      super(scope, id, props);

      const stackName =  'DemoApplication';
      const changeSetName = 'StagedChangeSet';

      const repository = new codecommit.Repository(this, 'Repository', {
        repositoryName: 'DemoApplication',
        code: codecommit.Code.fromZipFile('../demo-application.zip', 'main')
      });
      
      NagSuppressions.addStackSuppressions(this, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Ignoring IAM Wildcard after being reviewed'
        },
        {
          id: 'AwsSolutions-S1',
          reason: 'Ignoring S3 bucket access logs for the purpose of the workshop'
        },
        {
          id: 'AwsSolutions-KMS5',
          reason: 'Ignoring default kms key rotation for the purpose of the workshop'
        }
      ]);
    
      const topic = new sns.Topic(this, 'ARH-Assessment-Failure-Notifications', {masterKey: kms.Alias.fromAliasName(this,'snsKey','alias/aws/sns')});

      const sourceOutput = new codepipeline.Artifact('SourceArtifact');
      const source = new codepipeline_actions.CodeCommitSourceAction({
        actionName: 'Source',
        repository: repository,
        branch: 'main',
        output: sourceOutput,
        trigger: codepipeline_actions.CodeCommitTrigger.POLL,
      });

    
      const buildOutput = new codepipeline.Artifact('BuildArtifact');
      const buildProject = new codebuild.PipelineProject(this, `CdkSynth`, {
        environment: {
          buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:5.0'),
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: '18.x'
              },
              commands:[
                'npm install -g aws-cdk',
                'npm install -g cdk-assets'
              ],
            },
            pre_build: {
              commands:[
                "cd demo-application",
                "npm install"
              ],
            },
            build: {
              commands:[
                'cdk synth',
                'cdk-assets -p cdk.out/ServerlessCdkDemo-ServerlessStack.assets.json publish'
              ],
            },
          },
          artifacts:   {   files: '**/*' }
        }),
        encryptionKey: kms.Alias.fromAliasName(this,'s3Key','alias/aws/s3')
      });
      
      const assetPublishingPermissions = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [ `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-${cdk.DefaultStackSynthesizer.DEFAULT_QUALIFIER}-file-publishing-role-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`]
      });
      buildProject.addToRolePolicy(assetPublishingPermissions);

      const build = new codepipeline_actions.CodeBuildAction({
        actionName: 'CDKSynth',
        project: buildProject,
        input: sourceOutput,
        outputs: [ buildOutput ]
      });

      const prodStage = {
        stageName: 'Deploy',
        actions: [
          new codepipeline_actions.CloudFormationCreateReplaceChangeSetAction({
            actionName: 'PrepareChanges',
            stackName,
            changeSetName,
            adminPermissions: true,
            templatePath: buildOutput.atPath('demo-application/cdk.out/ServerlessCdkDemo-ServerlessStack.template.json'),
            runOrder: 1,
          }),
          new codepipeline_actions.CloudFormationExecuteChangeSetAction({
            actionName: 'ExecuteChanges',
            variablesNamespace: 'DeployStack',
            stackName,
            changeSetName,
            runOrder: 2,
          }),
        ],
      };
      
      const stepFunctionAction = new codepipeline_actions.StepFunctionInvokeAction({
          actionName: 'Invoke',
          stateMachine: stepfunctions.StateMachine.fromStateMachineArn(this, 'AssessmentAppSFN', `arn:aws:states:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stateMachine:ARH-Assessment`),
          stateMachineInput: codepipeline_actions.StateMachineInput.literal(
          { StackArn: "#{DeployStack.StackArn}",
          AppArn: `arn:aws:resiliencehub:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:app/71cb8eba-5672-4393-a8e0-05a534f0313e`
          }),
      });

      const pipeline = new codepipeline.Pipeline(this, 'ARH-Pipeline');
      pipeline.addStage({
        stageName: 'Source',
        actions: [source]
      });

      pipeline.addStage({
        stageName: 'Build',
        actions: [build]
      });

      pipeline.addStage(prodStage);

      pipeline.addStage({
          stageName: 'AppAssessment',
          actions: [stepFunctionAction],
      });
            
  
      new cdk.CfnOutput(this, 'TopicArn', { value: topic.topicArn });
    }
}