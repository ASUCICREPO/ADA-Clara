import { Stack, StackProps, CfnOutput, Duration, SecretValue, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import { FrontendAlignedApiStack } from './frontend-aligned-api-stack';
import { CognitoAuthStack } from './cognito-auth-stack';

export interface FrontendStackProps extends StackProps {
  frontendAlignedApiStack: FrontendAlignedApiStack;
  cognitoAuthStack: CognitoAuthStack;
  repositoryUrl?: string; // GitHub repository URL
  branch?: string; // Branch to deploy (default: main)
}

/**
 * Frontend Stack
 * 
 * Deploys the Next.js frontend using AWS Amplify with:
 * - Automatic builds from GitHub
 * - CodeBuild for CI/CD
 * - Environment variables from backend stacks
 * - Dynamic region detection
 */
export class FrontendStack extends Stack {
  public readonly amplifyApp: amplify.CfnApp;
  public readonly codeBuildProject: codebuild.Project;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const region = this.region || 'us-east-1';
    const account = this.account;
    const environment = this.node.tryGetContext('environment') || 'dev';
    const stackSuffix = environment === 'production' ? '' : `-${environment}`;

    // Get API Gateway URL from the frontend-aligned API stack
    const apiUrl = props.frontendAlignedApiStack.api.url;
    
    // Get Cognito configuration from Cognito Auth stack
    const userPoolId = props.cognitoAuthStack.userPool.userPoolId;
    const clientId = props.cognitoAuthStack.userPoolClient.userPoolClientId;
    const identityPoolId = props.cognitoAuthStack.identityPool.ref;
    
    // Use the existing domain from Cognito stack (don't create a new one)
    const domainPrefix = `ada-clara-${account}${stackSuffix}`;
    const domainUrl = `https://${domainPrefix}.auth.${region}.amazoncognito.com`;

    // Determine redirect URLs - will be updated after Amplify app is created
    // These will be updated in Amplify console after first deployment with actual domain
    // For now, use placeholder - user should update these in Cognito console after Amplify deployment
    // The actual domain will be: https://main.{amplifyAppId}.amplifyapp.com
    const redirectSignIn = `https://main.d1234567890.amplifyapp.com/auth/callback`;
    const redirectSignOut = `https://main.d1234567890.amplifyapp.com`;

    // BuildSpec for CodeBuild (when no source is provided)
    const codeBuildBuildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            'echo "Installing dependencies..."',
            'cd frontend',
            'npm ci',
          ],
        },
        build: {
          commands: [
            'echo "Building the Next.js application..."',
            'npm run build',
          ],
        },
        post_build: {
          commands: [
            'echo "Build completed. Artifacts are in .next/"',
          ],
        },
      },
      artifacts: {
        'base-directory': 'frontend/.next',
        files: ['**/*'],
      },
    });

    // CodeBuild Project for CI/CD
    // Use GitHub repository as source with webhooks disabled (no OAuth token needed)
    const codeBuildSource = props.repositoryUrl
      ? codebuild.Source.gitHub({
          owner: this.extractGitHubOwner(props.repositoryUrl),
          repo: this.extractGitHubRepo(props.repositoryUrl),
          webhook: false, // Disable webhooks to avoid requiring OAuth token
          branchOrRef: props.branch || 'main', // Use specified branch or default to main
          // Builds can be triggered manually or via Amplify
        })
      : codebuild.Source.s3({
          bucket: new s3.Bucket(this, 'CodeBuildSourceBucket', {
            bucketName: `ada-clara-codebuild-source${stackSuffix}-${account}`,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
          }),
          path: 'placeholder.zip',
        });

    this.codeBuildProject = new codebuild.Project(this, 'FrontendCodeBuild', {
      projectName: `ada-clara-frontend-build${stackSuffix}`,
      description: 'Build and deploy ADA Clara frontend',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      source: codeBuildSource,
      buildSpec: props.repositoryUrl
        ? codebuild.BuildSpec.fromSourceFilename('frontend/buildspec.yml')
        : codeBuildBuildSpec,
      timeout: Duration.minutes(30),
    });

    // Grant CodeBuild permissions to read SSM parameters
    this.codeBuildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter/ada-clara/*`,
      ],
    }));

    // Store configuration in SSM for CodeBuild to access
    new ssm.StringParameter(this, 'ApiUrlParameter', {
      parameterName: `/ada-clara/${environment}/api-url`,
      stringValue: apiUrl,
      description: 'API Gateway URL for frontend',
    });

    new ssm.StringParameter(this, 'CognitoUserPoolIdParameter', {
      parameterName: `/ada-clara/${environment}/cognito-user-pool-id`,
      stringValue: userPoolId,
      description: 'Cognito User Pool ID',
    });

    new ssm.StringParameter(this, 'CognitoClientIdParameter', {
      parameterName: `/ada-clara/${environment}/cognito-client-id`,
      stringValue: clientId,
      description: 'Cognito Client ID',
    });

    new ssm.StringParameter(this, 'CognitoIdentityPoolIdParameter', {
      parameterName: `/ada-clara/${environment}/cognito-identity-pool-id`,
      stringValue: identityPoolId,
      description: 'Cognito Identity Pool ID',
    });

    new ssm.StringParameter(this, 'CognitoDomainParameter', {
      parameterName: `/ada-clara/${environment}/cognito-domain`,
      stringValue: domainUrl,
      description: 'Cognito Domain URL',
    });

    new ssm.StringParameter(this, 'RegionParameter', {
      parameterName: `/ada-clara/${environment}/region`,
      stringValue: region,
      description: 'AWS Region',
    });

    // Build specification for Amplify
    // For Next.js static export (output: 'export'), the buildspec should match amplify.yml
    // When code is in frontend/ directory (from repo), we cd into it
    const buildSpec = {
      version: '1.0',
      frontend: {
        phases: {
          preBuild: {
            commands: [
              'cd frontend',
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npm run build',
            ],
          },
        },
        artifacts: {
          baseDirectory: 'frontend/out', // Static export outputs to 'out' directory
          files: ['**/*'],
        },
        cache: {
          paths: ['frontend/node_modules/**/*'],
        },
      },
    };

    // Amplify App (using L1 construct)
    // Note: If repository is provided, oauthToken is REQUIRED by Amplify
    // For now, we create the app without repository to avoid requiring OAuth token
    // User can connect the repository manually in the Amplify console after deployment
    this.amplifyApp = new amplify.CfnApp(this, 'FrontendApp', {
      name: `ada-clara-frontend${stackSuffix}`,
      // repository and oauthToken omitted - will be connected manually in console
      environmentVariables: [
        { name: 'NEXT_PUBLIC_API_BASE_URL', value: apiUrl },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: region },
        { name: 'NEXT_PUBLIC_COGNITO_REGION', value: region },
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: clientId },
        { name: 'NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID', value: identityPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_DOMAIN', value: domainUrl },
        { name: 'NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_IN', value: redirectSignIn },
        { name: 'NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_OUT', value: redirectSignOut },
        { name: 'NEXT_PUBLIC_ENVIRONMENT', value: environment },
      ],
      buildSpec: JSON.stringify(buildSpec),
      platform: 'WEB', // Static export - no SSR needed (like Patent-Novelty-Assessment)
      // Static export doesn't need custom rules - all routes are pre-rendered
    });

    // Add branch
    const branch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: this.amplifyApp.attrAppId,
      branchName: props.branch || 'main',
      enableAutoBuild: true,
      enablePullRequestPreview: true,
    });

    branch.addDependency(this.amplifyApp);

    // Outputs
    new CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyApp.attrAppId,
      description: 'Amplify App ID',
      exportName: `AdaClara-Frontend-AppId-${region}`,
    });

    new CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://${branch.branchName}.${this.amplifyApp.attrDefaultDomain}`,
      description: 'Amplify App URL',
      exportName: `AdaClara-Frontend-AppUrl-${region}`,
    });

    new CfnOutput(this, 'CodeBuildProjectName', {
      value: this.codeBuildProject.projectName,
      description: 'CodeBuild Project Name',
      exportName: `AdaClara-Frontend-CodeBuild-${region}`,
    });
  }

  /**
   * Extract GitHub owner from repository URL
   */
  private extractGitHubOwner(url: string): string {
    const match = url.match(/github\.com[:/]([^/]+)/);
    return match ? match[1] : '';
  }

  /**
   * Extract GitHub repository name from URL
   */
  private extractGitHubRepo(url: string): string {
    const match = url.match(/github\.com[:/][^/]+\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : '';
  }

}

