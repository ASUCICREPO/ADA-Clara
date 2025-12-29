#!/usr/bin/env ts-node

/**
 * Simple test to isolate EventBridge component creation
 */

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

class TestEventBridgeStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    // Create a simple Lambda function
    const testFunction = new lambda.Function(this, 'TestFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
    });

    // Create SNS topic
    const topic = new sns.Topic(this, 'TestTopic', {
      topicName: 'test-topic',
    });

    // Create SQS queue
    const queue = new sqs.Queue(this, 'TestQueue', {
      queueName: 'test-queue',
    });

    // Create EventBridge rule
    const rule = new events.Rule(this, 'TestRule', {
      ruleName: 'test-rule',
      schedule: events.Schedule.expression('rate(7 days)'),
    });

    // Add target
    rule.addTarget(new targets.LambdaFunction(testFunction, {
      deadLetterQueue: queue,
    }));

    console.log('EventBridge components created successfully');
  }
}

const app = new cdk.App();
new TestEventBridgeStack(app, 'TestEventBridge');
app.synth();