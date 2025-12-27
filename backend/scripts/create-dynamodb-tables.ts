#!/usr/bin/env node

/**
 * Create DynamoDB Tables Directly via AWS CLI
 * This bypasses CDK deployment issues
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, ScalarAttributeType, KeyType, BillingMode, StreamViewType } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

async function createTables() {
  console.log('🚀 Creating DynamoDB tables directly...\n');

  const tables = [
    {
      TableName: 'ada-clara-chat-sessions',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: StreamViewType.NEW_AND_OLD_IMAGES
      }
    },
    {
      TableName: 'ada-clara-professional-members',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST
    },
    {
      TableName: 'ada-clara-analytics',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST
    },
    {
      TableName: 'ada-clara-audit-logs',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST
    },
    {
      TableName: 'ada-clara-user-preferences',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST
    },
    {
      TableName: 'ada-clara-escalation-queue',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST,
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: StreamViewType.NEW_AND_OLD_IMAGES
      }
    },
    {
      TableName: 'ada-clara-knowledge-content',
      KeySchema: [
        { AttributeName: 'PK', KeyType: KeyType.HASH },
        { AttributeName: 'SK', KeyType: KeyType.RANGE }
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'SK', AttributeType: ScalarAttributeType.S }
      ],
      BillingMode: BillingMode.PAY_PER_REQUEST
    }
  ];

  for (const tableConfig of tables) {
    try {
      // Check if table already exists
      try {
        await dynamoClient.send(new DescribeTableCommand({ TableName: tableConfig.TableName }));
        console.log(`✅ Table ${tableConfig.TableName} already exists`);
        continue;
      } catch (error) {
        // Table doesn't exist, create it
      }

      console.log(`📝 Creating table: ${tableConfig.TableName}`);
      await dynamoClient.send(new CreateTableCommand(tableConfig));
      console.log(`✅ Table ${tableConfig.TableName} created successfully`);
      
      // Wait a bit between table creations
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to create table ${tableConfig.TableName}:`, error);
    }
  }

  console.log('\n🎉 DynamoDB table creation completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm run test-dynamodb');
  console.log('2. Run: npm run test-s3');
  console.log('3. Run: npm run test-data-service');
}

if (require.main === module) {
  createTables().catch(console.error);
}

export { createTables };