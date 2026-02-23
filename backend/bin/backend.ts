#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { AdaClaraUnifiedStack } from '../lib/ada-clara-unified-stack';

const app = new cdk.App();

// Environment configuration - all dynamic, no hardcoded values
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION;

if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT must be set. Run: export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)');
}

if (!region) {
  throw new Error('CDK_DEFAULT_REGION or AWS_REGION must be set. Run: export CDK_DEFAULT_REGION=$(aws configure get region)');
}

const env = {
  account,
  region
};

// Get environment context (development vs production)
const environment = app.node.tryGetContext('environment') || 'dev';

// Get Amplify App ID from context (passed by deployment script)
const amplifyAppId = app.node.tryGetContext('amplifyAppId');

// Create unified stack
const stack = new AdaClaraUnifiedStack(app, 'AdaClaraUnifiedStack', {
  env,
  description: 'ADA Clara Unified Stack - Complete backend and frontend infrastructure',
});

// ========== CDK-NAG SECURITY VALIDATION ==========
// Add AWS Solutions security checks to validate best practices
// This will fail the build if critical security issues are found
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// ========== CDK-NAG SUPPRESSIONS ==========
// Suppress known acceptable findings with detailed justification
// All suppressions have been reviewed and approved

// IAM5: Wildcard permissions necessary for specific use cases
NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-IAM5',
    reason: 'Wildcards necessary for DynamoDB GSI access patterns. GSI names are dynamic and require index/* pattern for Query operations.',
    appliesTo: [
      'Resource::<EscalationRequestsTable6CFC7DD8.Arn>/index/*',
      'Resource::<DataTable447BC44E.Arn>/index/*',
      'Resource::<ContentTrackingTable*/index/*',
    ],
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'Wildcards necessary for S3 object operations. Bucket contains dynamic object keys that cannot be enumerated at deployment time.',
    appliesTo: [
      'Resource::<ContentBucket52D4B12C.Arn>/*',
      'Action::s3:GetBucket*',
      'Action::s3:GetObject*',
      'Action::s3:List*',
    ],
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'Wildcards necessary for S3 Vectors operations. Vector bucket managed by third-party cdk-s3-vectors library.',
    appliesTo: [
      'Resource::arn:aws:s3vectors:us-west-2:023336033519:bucket/<VectorsBucketVectorBucketCustomResourceDE0CFF0A.VectorBucketName>/*',
    ],
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'Wildcards necessary for Lambda versioning. CDK automatically creates versions and aliases with dynamic ARNs.',
    appliesTo: [
      'Resource::<AnalyticsProcessor3FF027E0.Arn>:*',
      'Resource::<VectorsBucketS3VectorsBucketHandler9D937757.Arn>:*',
      'Resource::<VectorIndexS3VectorsHandler909AC3D7.Arn>:*',
    ],
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'API Gateway wildcard necessary for execute-api permissions. Allows invocation of all methods/paths within this specific API only.',
    appliesTo: [
      'Resource::arn:aws:execute-api:us-west-2:023336033519:<HttpApiF5A9A8A7>/*/*/*/*',
      'Resource::arn:aws:execute-api:us-west-2:023336033519:<HttpApiF5A9A8A7>/*/*/*/*/GET/config',
      'Resource::arn:aws:execute-api:us-west-2:023336033519:<HttpApiF5A9A8A7>/*/*/*/*/POST/chat',
      'Resource::arn:aws:execute-api:us-west-2:023336033519:<HttpApiF5A9A8A7>/*/*/*/*/POST/escalation/request',
    ],
  },
  {
    id: 'AwsSolutions-IAM5',
    reason: 'Third-party cdk-s3-vectors library requires wildcard permissions for custom resource handlers.',
    appliesTo: ['Resource::*'],
  },
]);

// IAM4: AWS managed policies are standard practice for Lambda execution
NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-IAM4',
    reason: 'AWSLambdaBasicExecutionRole is AWS best practice for Lambda CloudWatch Logs access. Provides minimal permissions for logging only.',
    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
  },
  {
    id: 'AwsSolutions-IAM4',
    reason: 'AmazonS3ReadOnlyAccess used by Knowledge Base role for reading content from S3. Scoped to specific bucket via additional policy.',
    appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonS3ReadOnlyAccess'],
  },
]);

// APIG4: Public endpoints intentional for chatbot functionality
NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-APIG4',
    reason: 'Public chatbot endpoints require unauthenticated access for end users. Admin endpoints are protected with Cognito JWT authorizer.',
  },
]);

// COG7: Unauthenticated access required for public chatbot
NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-COG7',
    reason: 'Unauthenticated Cognito access required for public chatbot functionality. Authenticated users have additional permissions for admin features.',
  },
]);

// COG2: MFA optional for proof-of-concept deployment
NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-COG2',
    reason: 'MFA not required for PoC deployment. Should be enabled for production with admin user enforcement.',
  },
]);

// L1: Third-party construct library (cdk-s3-vectors) uses L1 constructs
NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-L1',
    reason: 'Third-party cdk-s3-vectors library uses L1 constructs for S3 Vectors custom resource handlers. Library maintained by AWS community.',
  },
]);

console.log('CDK-Nag security validation enabled with approved suppressions.');
