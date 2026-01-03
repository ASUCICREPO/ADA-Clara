/**
 * Jest Test Setup
 * 
 * Global test configuration and mocks
 */

// Mock AWS SDK clients globally
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-comprehend');

// Set up environment variables for tests
process.env.AWS_REGION = 'us-east-1';
process.env.ANALYTICS_TABLE = 'ada-clara-analytics-test';
process.env.CONVERSATIONS_TABLE = 'ada-clara-conversations-test';
process.env.MESSAGES_TABLE = 'ada-clara-messages-test';
process.env.QUESTIONS_TABLE = 'ada-clara-questions-test';
process.env.UNANSWERED_QUESTIONS_TABLE = 'ada-clara-unanswered-questions-test';
process.env.CONTENT_BUCKET = 'ada-clara-content-test';
process.env.VECTORS_BUCKET = 'ada-clara-vectors-test';

// Global test timeout
jest.setTimeout(30000);

// Console log suppression for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress console.log during tests unless VERBOSE_TESTS is set
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});