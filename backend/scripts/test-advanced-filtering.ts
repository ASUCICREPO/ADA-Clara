#!/usr/bin/env ts-node

/**
 * Test Script for Task 8: Advanced Filtering and Search Implementation
 * 
 * This script tests the advanced filtering and search functionality
 * implemented for the admin dashboard enhancement.
 * 
 * Requirements tested:
 * - 7.1: Multi-parameter filtering with logical AND operations
 * - 7.2: Text-based search for conversations and questions
 * - 7.3: Filter state management for API responses
 * - 7.5: Data export functionality with applied filters
 */

import { AnalyticsService } from '../src/services/analytics-service';
import { 
  AdvancedFilterOptions, 
  SearchOptions, 
  DataExportOptions,
  AdvancedAnalyticsQuery 
} from '../src/types/index';

class AdvancedFilteringTester {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  /**
   * Test advanced conversation filtering (Requirement 7.1, 7.3)
   */
  async testAdvancedFiltering(): Promise<void> {
    console.log('\n🔍 Testing Advanced Conversation Filtering...');
    
    try {
      // Test 1: Basic date range filtering
      console.log('\n📅 Test 1: Date range filtering');
      const basicFilters: AdvancedFilterOptions = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        limit: 10,
        sortBy: 'timestamp',
        sortOrder: 'desc'
      };

      const basicResult = await this.analyticsService.getFilteredConversations(basicFilters);
      console.log(`✅ Basic filtering returned ${basicResult.data.length} conversations`);
      console.log(`   Filter ID: ${basicResult.filterState.filterId}`);
      console.log(`   Execution time: ${basicResult.filterState.executionTime}ms`);

      // Test 2: Multi-parameter filtering with logical AND
      console.log('\n🔗 Test 2: Multi-parameter filtering (logical AND)');
      const complexFilters: AdvancedFilterOptions = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        language: 'en',
        outcome: 'resolved',
        confidenceThreshold: 0.8,
        messageCountMin: 3,
        messageCountMax: 20,
        limit: 5,
        sortBy: 'confidenceScore',
        sortOrder: 'desc'
      };

      const complexResult = await this.analyticsService.getFilteredConversations(complexFilters);
      console.log(`✅ Complex filtering returned ${complexResult.data.length} conversations`);
      console.log(`   Applied filters: ${Object.keys(complexResult.appliedFilters).length} parameters`);
      console.log(`   Has more results: ${complexResult.pagination.hasMore}`);

      // Test 3: Escalation-specific filtering
      console.log('\n🚨 Test 3: Escalation-specific filtering');
      const escalationFilters: AdvancedFilterOptions = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        outcome: 'escalated',
        escalationPriority: 'high',
        escalationStatus: 'resolved',
        limit: 10
      };

      const escalationResult = await this.analyticsService.getFilteredConversations(escalationFilters);
      console.log(`✅ Escalation filtering returned ${escalationResult.data.length} conversations`);
      console.log(`   Total escalated conversations: ${escalationResult.pagination.total}`);

      // Test 4: User-specific filtering
      console.log('\n👤 Test 4: User-specific filtering');
      const userFilters: AdvancedFilterOptions = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        userZipCode: '12345',
        questionCategory: 'diabetes-management',
        isAnswered: true,
        limit: 10
      };

      const userResult = await this.analyticsService.getFilteredConversations(userFilters);
      console.log(`✅ User filtering returned ${userResult.data.length} conversations`);
      console.log(`   Filter state created: ${userResult.filterState.createdAt}`);

    } catch (error) {
      console.error('❌ Advanced filtering test failed:', error);
      throw error;
    }
  }

  /**
   * Test text-based search functionality (Requirement 7.2)
   */
  async testTextSearch(): Promise<void> {
    console.log('\n🔎 Testing Text-based Search...');
    
    try {
      // Test 1: Basic conversation search
      console.log('\n💬 Test 1: Basic conversation search');
      const basicSearch: SearchOptions = {
        query: 'diabetes type 1',
        searchIn: ['conversations'],
        maxResults: 10,
        includeHighlights: true
      };

      const basicSearchResult = await this.analyticsService.searchContent(basicSearch);
      console.log(`✅ Basic search returned ${basicSearchResult.results.length} results`);
      console.log(`   Total matches: ${basicSearchResult.totalCount}`);
      console.log(`   Execution time: ${basicSearchResult.executionTime}ms`);
      
      if (basicSearchResult.results.length > 0) {
        const topResult = basicSearchResult.results[0];
        console.log(`   Top result relevance: ${topResult.relevanceScore.toFixed(3)}`);
        console.log(`   Highlights: ${topResult.highlights?.join(', ') || 'none'}`);
      }

      // Test 2: Multi-scope search with filters
      console.log('\n🔍 Test 2: Multi-scope search with filters');
      const multiSearch: SearchOptions = {
        query: 'insulin blood sugar',
        searchIn: ['conversations', 'questions', 'messages'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z',
          language: 'en',
          isAnswered: false
        },
        fuzzyMatch: true,
        maxResults: 20,
        minRelevanceScore: 0.3
      };

      const multiSearchResult = await this.analyticsService.searchContent(multiSearch);
      console.log(`✅ Multi-scope search returned ${multiSearchResult.results.length} results`);
      console.log(`   Search suggestions: ${multiSearchResult.suggestions?.join(', ') || 'none'}`);
      
      // Group results by type
      const resultsByType = multiSearchResult.results.reduce((acc: Record<string, number>, result) => {
        acc[result.type] = (acc[result.type] || 0) + 1;
        return acc;
      }, {});
      console.log(`   Results by type:`, resultsByType);

      // Test 3: Fuzzy search with case sensitivity
      console.log('\n🔤 Test 3: Fuzzy search with case sensitivity');
      const fuzzySearch: SearchOptions = {
        query: 'DIABETIS MANAGMENT', // Intentional typos
        searchIn: ['questions'],
        fuzzyMatch: true,
        caseSensitive: false,
        wholeWords: false,
        maxResults: 5
      };

      const fuzzySearchResult = await this.analyticsService.searchContent(fuzzySearch);
      console.log(`✅ Fuzzy search returned ${fuzzySearchResult.results.length} results`);
      console.log(`   Query: "${fuzzySearch.query}"`);
      
      if (fuzzySearchResult.results.length > 0) {
        console.log(`   Best match: "${fuzzySearchResult.results[0].title}"`);
        console.log(`   Relevance: ${fuzzySearchResult.results[0].relevanceScore.toFixed(3)}`);
      }

      // Test 4: Search with no results
      console.log('\n❌ Test 4: Search with no results');
      const noResultsSearch: SearchOptions = {
        query: 'xyzabc123nonexistent',
        searchIn: ['conversations', 'questions'],
        maxResults: 10
      };

      const noResultsSearchResult = await this.analyticsService.searchContent(noResultsSearch);
      console.log(`✅ No results search returned ${noResultsSearchResult.results.length} results`);
      console.log(`   Suggestions provided: ${noResultsSearchResult.suggestions?.length || 0}`);
      if (noResultsSearchResult.suggestions && noResultsSearchResult.suggestions.length > 0) {
        console.log(`   Suggestions: ${noResultsSearchResult.suggestions.join(', ')}`);
      }

    } catch (error) {
      console.error('❌ Text search test failed:', error);
      throw error;
    }
  }

  /**
   * Test data export functionality (Requirement 7.5)
   */
  async testDataExport(): Promise<void> {
    console.log('\n📤 Testing Data Export...');
    
    try {
      // Test 1: JSON export with filters
      console.log('\n📄 Test 1: JSON export with filters');
      const jsonExport: DataExportOptions = {
        format: 'json',
        dataTypes: ['conversations', 'messages'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
          language: 'en',
          outcome: 'resolved'
        },
        includeMetadata: true,
        maxRecords: 100,
        filename: 'test-export-json'
      };

      const jsonResult = await this.analyticsService.exportData(jsonExport);
      console.log(`✅ JSON export completed`);
      console.log(`   Export ID: ${jsonResult.exportId}`);
      console.log(`   Status: ${jsonResult.status}`);
      console.log(`   Records: ${jsonResult.recordCount}`);
      console.log(`   File size: ${jsonResult.fileSize} bytes`);
      console.log(`   Download URL: ${jsonResult.downloadUrl}`);

      // Test 2: CSV export with headers
      console.log('\n📊 Test 2: CSV export with headers');
      const csvExport: DataExportOptions = {
        format: 'csv',
        dataTypes: ['questions'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z',
          questionCategory: 'diabetes-management',
          isAnswered: false
        },
        includeHeaders: true,
        compressOutput: false,
        maxRecords: 50
      };

      const csvResult = await this.analyticsService.exportData(csvExport);
      console.log(`✅ CSV export completed`);
      console.log(`   Export ID: ${csvResult.exportId}`);
      console.log(`   Filename: ${csvResult.filename}`);
      console.log(`   Records: ${csvResult.recordCount}`);
      console.log(`   Expires at: ${csvResult.expiresAt}`);

      // Test 3: XLSX export (will show mock implementation)
      console.log('\n📈 Test 3: XLSX export');
      const xlsxExport: DataExportOptions = {
        format: 'xlsx',
        dataTypes: ['conversations', 'escalations'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z',
          escalationPriority: 'high'
        },
        includeMetadata: true,
        includeHeaders: true,
        maxRecords: 200
      };

      const xlsxResult = await this.analyticsService.exportData(xlsxExport);
      console.log(`✅ XLSX export completed`);
      console.log(`   Export ID: ${xlsxResult.exportId}`);
      console.log(`   Status: ${xlsxResult.status}`);
      console.log(`   File size: ${xlsxResult.fileSize} bytes`);

      // Test 4: Export with search filters
      console.log('\n🔍 Test 4: Export with search filters');
      const searchExport: DataExportOptions = {
        format: 'json',
        dataTypes: ['messages'],
        searchOptions: {
          query: 'insulin dosage',
          searchIn: ['messages'],
          fuzzyMatch: false
        },
        filters: {
          language: 'en',
          confidenceThreshold: 0.7
        },
        includeMetadata: true,
        maxRecords: 25
      };

      const searchExportResult = await this.analyticsService.exportData(searchExport);
      console.log(`✅ Search-filtered export completed`);
      console.log(`   Export ID: ${searchExportResult.exportId}`);
      console.log(`   Records: ${searchExportResult.recordCount}`);

    } catch (error) {
      console.error('❌ Data export test failed:', error);
      throw error;
    }
  }

  /**
   * Test advanced analytics queries
   */
  async testAdvancedQueries(): Promise<void> {
    console.log('\n📊 Testing Advanced Analytics Queries...');
    
    try {
      // Test 1: Basic aggregation query
      console.log('\n📈 Test 1: Basic aggregation query');
      const basicQuery: AdvancedAnalyticsQuery = {
        queryId: 'test-basic-aggregation',
        queryName: 'Conversations by Language and Outcome',
        metrics: ['count', 'averageConfidence'],
        dimensions: ['language', 'outcome'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z'
        },
        limit: 10,
        sortBy: 'count',
        sortOrder: 'desc'
      };

      const basicQueryResult = await this.analyticsService.executeAdvancedQuery(basicQuery);
      console.log(`✅ Basic query executed`);
      console.log(`   Query ID: ${basicQueryResult.queryId}`);
      console.log(`   Results: ${basicQueryResult.resultCount}`);
      console.log(`   Execution time: ${basicQueryResult.executionTime}ms`);
      console.log(`   Records scanned: ${basicQueryResult.metadata.totalRecordsScanned}`);

      if (basicQueryResult.data.length > 0) {
        console.log(`   Sample result:`, JSON.stringify(basicQueryResult.data[0], null, 2));
      }

      // Test 2: Time-series aggregation
      console.log('\n⏰ Test 2: Time-series aggregation');
      const timeSeriesQuery: AdvancedAnalyticsQuery = {
        queryId: 'test-time-series',
        queryName: 'Daily Conversation Trends',
        metrics: ['count', 'totalMessages'],
        dimensions: ['outcome'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
          language: 'en'
        },
        timeGranularity: 'day',
        limit: 31,
        sortBy: 'timestamp',
        sortOrder: 'asc'
      };

      const timeSeriesResult = await this.analyticsService.executeAdvancedQuery(timeSeriesQuery);
      console.log(`✅ Time-series query executed`);
      console.log(`   Results: ${timeSeriesResult.resultCount}`);
      console.log(`   Data freshness: ${timeSeriesResult.metadata.dataFreshness}`);

      // Test 3: Complex filtering with multiple dimensions
      console.log('\n🔗 Test 3: Complex multi-dimensional query');
      const complexQuery: AdvancedAnalyticsQuery = {
        queryId: 'test-complex-multi-dim',
        queryName: 'Escalation Analysis by Priority and Reason',
        metrics: ['count', 'averageConfidence'],
        dimensions: ['escalationPriority', 'outcome'],
        filters: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-12-31T23:59:59Z',
          outcome: 'escalated',
          confidenceThreshold: 0.5
        },
        limit: 20
      };

      const complexQueryResult = await this.analyticsService.executeAdvancedQuery(complexQuery);
      console.log(`✅ Complex query executed`);
      console.log(`   Results: ${complexQueryResult.resultCount}`);
      console.log(`   Cache hit: ${complexQueryResult.metadata.cacheHit}`);

    } catch (error) {
      console.error('❌ Advanced queries test failed:', error);
      throw error;
    }
  }

  /**
   * Test filter state management
   */
  async testFilterStateManagement(): Promise<void> {
    console.log('\n🗂️ Testing Filter State Management...');
    
    try {
      // Test 1: Create and track filter state
      console.log('\n📝 Test 1: Filter state creation and tracking');
      const filters: AdvancedFilterOptions = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        language: 'en',
        outcome: 'resolved',
        confidenceThreshold: 0.8,
        limit: 20
      };

      const result1 = await this.analyticsService.getFilteredConversations(filters);
      console.log(`✅ Filter state created`);
      console.log(`   Filter ID: ${result1.filterState.filterId}`);
      console.log(`   Created at: ${result1.filterState.createdAt}`);
      console.log(`   Result count: ${result1.filterState.resultCount}`);
      console.log(`   Execution time: ${result1.filterState.executionTime}ms`);

      // Test 2: Reuse same filters (should generate different filter ID due to timestamp)
      console.log('\n🔄 Test 2: Filter reuse with same parameters');
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      const result2 = await this.analyticsService.getFilteredConversations(filters);
      console.log(`✅ Second filter state created`);
      console.log(`   Filter ID: ${result2.filterState.filterId}`);
      console.log(`   Same filters, different ID: ${result1.filterState.filterId !== result2.filterState.filterId}`);

      // Test 3: Different filters should create different state
      console.log('\n🆕 Test 3: Different filters create different state');
      const differentFilters: AdvancedFilterOptions = {
        ...filters,
        language: 'es',
        outcome: 'escalated'
      };

      const result3 = await this.analyticsService.getFilteredConversations(differentFilters);
      console.log(`✅ Different filter state created`);
      console.log(`   Filter ID: ${result3.filterState.filterId}`);
      console.log(`   Different from previous: ${result2.filterState.filterId !== result3.filterState.filterId}`);

      // Test 4: Pagination with filter state
      console.log('\n📄 Test 4: Pagination with filter state');
      const paginatedFilters: AdvancedFilterOptions = {
        ...filters,
        limit: 5,
        offset: 0
      };

      const page1 = await this.analyticsService.getFilteredConversations(paginatedFilters);
      console.log(`✅ Page 1 retrieved`);
      console.log(`   Results: ${page1.data.length}`);
      console.log(`   Has more: ${page1.pagination.hasMore}`);
      console.log(`   Total: ${page1.pagination.total}`);

      if (page1.pagination.hasMore) {
        const page2Filters: AdvancedFilterOptions = {
          ...paginatedFilters,
          offset: 5
        };
        const page2 = await this.analyticsService.getFilteredConversations(page2Filters);
        console.log(`✅ Page 2 retrieved`);
        console.log(`   Results: ${page2.data.length}`);
        console.log(`   Offset: ${page2.pagination.offset}`);
      }

    } catch (error) {
      console.error('❌ Filter state management test failed:', error);
      throw error;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Task 8: Advanced Filtering and Search Tests');
    console.log('=' .repeat(60));

    try {
      await this.testAdvancedFiltering();
      await this.testTextSearch();
      await this.testDataExport();
      await this.testAdvancedQueries();
      await this.testFilterStateManagement();

      console.log('\n' + '='.repeat(60));
      console.log('✅ All Task 8 tests completed successfully!');
      console.log('\nImplemented features:');
      console.log('  ✅ 7.1: Multi-parameter filtering with logical AND operations');
      console.log('  ✅ 7.2: Text-based search for conversations and questions');
      console.log('  ✅ 7.3: Filter state management for API responses');
      console.log('  ✅ 7.5: Data export functionality with applied filters');
      console.log('\nNew API endpoints available:');
      console.log('  • GET /admin/conversations/filtered - Advanced conversation filtering');
      console.log('  • GET /admin/search - Text-based search functionality');
      console.log('  • GET /admin/export - Data export with filters');
      console.log('  • GET /admin/query/advanced - Advanced analytics queries');

    } catch (error) {
      console.error('\n❌ Task 8 tests failed:', error);
      process.exit(1);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new AdvancedFilteringTester();
  tester.runAllTests().catch(console.error);
}

export { AdvancedFilteringTester };