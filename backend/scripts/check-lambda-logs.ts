import { CloudWatchLogsClient, DescribeLogStreamsCommand, GetLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

const cloudWatchLogs = new CloudWatchLogsClient({ region: 'us-east-1' });

const LOG_GROUP_NAME = '/aws/lambda/AdaClaraS3VectorsMinimalTe-CrawlerFunction614391C2-LWtb9VkbQvKi';

async function checkLambdaLogs() {
  console.log('🔍 Checking Lambda logs...');
  
  try {
    // Get the latest log stream
    const describeStreamsCommand = new DescribeLogStreamsCommand({
      logGroupName: LOG_GROUP_NAME,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 1
    });
    
    const streamsResponse = await cloudWatchLogs.send(describeStreamsCommand);
    const latestStream = streamsResponse.logStreams?.[0];
    
    if (!latestStream) {
      console.log('❌ No log streams found');
      return;
    }
    
    console.log(`📋 Latest log stream: ${latestStream.logStreamName}`);
    
    // Get the latest log events
    const getEventsCommand = new GetLogEventsCommand({
      logGroupName: LOG_GROUP_NAME,
      logStreamName: latestStream.logStreamName,
      limit: 50,
      startFromHead: false
    });
    
    const eventsResponse = await cloudWatchLogs.send(getEventsCommand);
    const events = eventsResponse.events || [];
    
    console.log(`📝 Found ${events.length} log events:`);
    console.log('=' .repeat(80));
    
    events.forEach((event: any, index: number) => {
      const timestamp = new Date(event.timestamp || 0).toISOString();
      console.log(`[${index + 1}] ${timestamp}`);
      console.log(event.message);
      console.log('-'.repeat(40));
    });
    
  } catch (error: any) {
    console.error('❌ Failed to get logs:', error.message);
  }
}

checkLambdaLogs();