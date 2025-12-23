import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class WebCrawlerTestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for storing scraped content
    const contentBucket = new s3.Bucket(this, 'DiabetesContentBucket', {
      bucketName: 'ada-clara-diabetes-content',
      versioned: true,
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        expiration: Duration.days(90),
        noncurrentVersionExpiration: Duration.days(30),
      }]
    });

    // IAM role for the crawler Lambda
    const crawlerRole = new iam.Role(this, 'CrawlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
                'bedrock:ListFoundationModels',
              ],
              resources: ['*'],
            }),
          ],
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                contentBucket.bucketArn,
                `${contentBucket.bucketArn}/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Lambda function for testing Bedrock web crawler
    const bedrockCrawlerLambda = new lambda.Function(this, 'BedrockCrawlerTest', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bedrock-crawler.handler',
      code: lambda.Code.fromAsset('lambda/bedrock-crawler'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      role: crawlerRole,
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        TARGET_DOMAIN: 'diabetes.org',
      },
    });

    // Lambda function for custom crawler comparison (Playwright/Scrapy alternative)
    const customCrawlerLambda = new lambda.Function(this, 'CustomCrawlerTest', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'custom-crawler.handler',
      code: lambda.Code.fromAsset('lambda/custom-crawler'),
      timeout: Duration.minutes(15),
      memorySize: 2048,
      role: crawlerRole,
      environment: {
        CONTENT_BUCKET: contentBucket.bucketName,
        TARGET_DOMAIN: 'diabetes.org',
      },
    });

    // EventBridge rule for weekly scraping (disabled by default for testing)
    const weeklySchedule = new events.Rule(this, 'WeeklyScrapingSchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        weekDay: 'SUN',
      }),
      enabled: false, // Start disabled for testing
    });

    weeklySchedule.addTarget(new targets.LambdaFunction(bedrockCrawlerLambda));
  }
}