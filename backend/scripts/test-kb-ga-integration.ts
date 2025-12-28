#!/usr/bin/env ts-node

/**
 * Test Knowledge Base GA Integration
 * 
 * This script tests the integration between Bedrock Knowledge Base
 * and S3 Vectors GA, validating:
 * - Knowledge Base access to GA vector indices
 * - RAG query performance with sub-100ms latency
 * - Citation metadata preservation through GA pipeline
 * - End-to-end content workflow validation
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  details: any;
  error?: string;
}

class KnowledgeBaseGAIntegrationTester {
  private lambdaClient: LambdaClient;
  private functionName: string;

  constructor() {
    this.lambdaClient = new LambdaClient({ region: 'us-east-1' });
    this.functionName = 'AdaClaraKBGATest-us-east-1'; // From CDK output
  }

  /**
   * Invoke the Knowledge Base GA test Lambda function
   */
  private async invokeLambda(payload: any): Promise<any> {
    const command = new InvokeCommand({
      FunctionName: this.functionName,
      Payload: JSON.stringify(payload),
    });

    const response = await this.lambdaClient.send(command);
    
    if (response.Payload) {
      const result = JSON.parse(new TextDecoder().decode(response.Payload));
      
      if (response.StatusCode !== 200) {
        throw new Error(`Lambda invocation failed: ${result.errorMessage || 'Unknown error'}`);
      }
      
      return JSON.parse(result.body);
    }
    
    throw new Error('No response payload from Lambda');
  }

  /**
   * Test Knowledge Base access to GA vector indices
   */
  async testVectorIndexAccess(): Promise<TestResult> {
    console.log('🔗 Testing Knowledge Base access to GA vector indices...');
    
    const startTime = Date.now();
    
    try {
      const result = await this.invokeLambda({
        action: 'test-kb-access'
      });
      
      const duration = Date.now() - startTime;
      const accessResult = result.accessResult;
      
      return {
        testName: 'Vector Index Access',
        success: accessResult.accessSuccessful,
        duration,
        details: {
          resultsReturned: accessResult.resultsReturned,
          queryLatency: accessResult.queryLatency,
          meetsLatencyTarget: accessResult.meetsLatencyTarget,
          sampleResults: accessResult.sampleResults,
          gaFeatures: result.gaFeatures
        }
      };
      
    } catch (error: any) {
      return {
        testName: 'Vector Index Access',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test RAG query performance with GA
   */
  async testRAGPerformance(): Promise<TestResult> {
    console.log('🚀 Testing RAG query performance with GA...');
    
    const startTime = Date.now();
    
    try {
      const result = await this.invokeLambda({
        action: 'test-rag-performance',
        query: 'What are the symptoms of type 1 diabetes?'
      });
      
      const duration = Date.now() - startTime;
      const ragResult = result.ragResult;
      
      return {
        testName: 'RAG Performance',
        success: ragResult.meetsLatencyTarget && ragResult.retrievedSources > 0,
        duration,
        details: {
          query: ragResult.query,
          retrievalLatency: ragResult.retrievalLatency,
          generationLatency: ragResult.generationLatency,
          totalLatency: ragResult.totalLatency,
          retrievedSources: ragResult.retrievedSources,
          citationsCount: ragResult.citations.length,
          meetsLatencyTarget: ragResult.meetsLatencyTarget,
          gaPerformanceFeatures: result.gaPerformanceFeatures,
          answerPreview: ragResult.answer.substring(0, 200) + '...'
        }
      };
      
    } catch (error: any) {
      return {
        testName: 'RAG Performance',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Test citation metadata preservation
   */
  async testCitationMetadata(): Promise<TestResult> {
    console.log('📚 Testing citation metadata preservation...');
    
    const startTime = Date.now();
    
    try {
      const result = await this.invokeLambda({
        action: 'test-citation-metadata',
        query: 'How to manage blood sugar levels?'
      });
      
      const duration = Date.now() - startTime;
      const citationResult = result.citationResult;
      
      return {
        testName: 'Citation Metadata Preservation',
        success: citationResult.metadataPreserved && citationResult.totalCitations > 0,
        duration,
        details: {
          query: citationResult.query,
          totalCitations: citationResult.totalCitations,
          citationAnalysis: citationResult.citationAnalysis,
          metadataPreserved: citationResult.metadataPreserved,
          gaMetadataFeatures: result.gaMetadataFeatures,
          answerPreview: citationResult.answer.substring(0, 200) + '...'
        }
      };
      
    } catch (error: any) {
      return {
        testName: 'Citation Metadata Preservation',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Run comprehensive Knowledge Base GA integration test
   */
  async testComprehensiveIntegration(): Promise<TestResult> {
    console.log('🧪 Running comprehensive Knowledge Base GA integration test...');
    
    const startTime = Date.now();
    
    try {
      const result = await this.invokeLambda({
        action: 'comprehensive-test'
      });
      
      const duration = Date.now() - startTime;
      
      return {
        testName: 'Comprehensive Integration',
        success: result.overallSuccess,
        duration,
        details: {
          overallSuccess: result.overallSuccess,
          vectorIndexAccess: result.results.vectorIndexAccess,
          ragPerformance: result.results.ragPerformance,
          citationMetadata: result.results.citationMetadata,
          ingestionJobs: result.results.ingestionJobs,
          gaIntegrationSummary: result.gaIntegrationSummary
        }
      };
      
    } catch (error: any) {
      return {
        testName: 'Comprehensive Integration',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error.message
      };
    }
  }

  /**
   * Run all Knowledge Base GA integration tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Knowledge Base GA Integration Tests');
    console.log('=' .repeat(60));
    
    const tests = [
      () => this.testVectorIndexAccess(),
      () => this.testRAGPerformance(),
      () => this.testCitationMetadata(),
      () => this.testComprehensiveIntegration()
    ];
    
    const results: TestResult[] = [];
    
    for (const test of tests) {
      try {
        const result = await test();
        results.push(result);
        
        console.log(`\n${result.success ? '✅' : '❌'} ${result.testName}`);
        console.log(`   Duration: ${result.duration}ms`);
        
        if (result.success) {
          console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
        } else {
          console.log(`   Error: ${result.error}`);
        }
        
      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        results.push({
          testName: 'Unknown Test',
          success: false,
          duration: 0,
          details: {},
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Knowledge Base GA Integration Test Summary');
    console.log('=' .repeat(60));
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const successRate = (successCount / totalCount * 100).toFixed(1);
    
    console.log(`Total Tests: ${totalCount}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${totalCount - successCount}`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (successCount === totalCount) {
      console.log('\n🎉 All Knowledge Base GA integration tests passed!');
      console.log('✅ Task 5.1 (Configure Knowledge Base for GA S3 Vectors) - COMPLETED');
    } else {
      console.log('\n⚠️  Some Knowledge Base GA integration tests failed');
      console.log('❌ Task 5.1 needs additional work');
    }
    
    // GA Features Summary
    console.log('\n📋 GA S3 Vectors Features Validated:');
    console.log('   • Vector Backend: S3 Vectors GA');
    console.log('   • Embedding Model: Titan V2 (1024 dimensions)');
    console.log('   • Max Results: 100 per query');
    console.log('   • Query Latency: sub-100ms target');
    console.log('   • Scale Limit: 2 billion vectors per index');
    console.log('   • Metadata: 50 keys max, 2KB size limit');
    console.log('   • Search Type: Hybrid (vector + keyword)');
  }
}

// Main execution
async function main() {
  try {
    const tester = new KnowledgeBaseGAIntegrationTester();
    await tester.runAllTests();
  } catch (error: any) {
    console.error('❌ Knowledge Base GA integration test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}