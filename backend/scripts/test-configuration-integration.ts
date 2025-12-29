#!/usr/bin/env node

/**
 * Test Configuration Integration with Crawler
 * 
 * Tests the integration between the configuration management system and the crawler.
 * Validates that configuration changes affect crawler behavior.
 */

import { ConfigurationService } from '../src/services/configuration-service';

async function testConfigurationIntegration() {
  console.log('🔗 Testing Configuration Integration with Crawler...\n');

  const configService = new ConfigurationService();
  let testsPassed = 0;
  let testsTotal = 0;

  function test(name: string, condition: boolean, details?: string) {
    testsTotal++;
    if (condition) {
      console.log(`✅ ${name}`);
      testsPassed++;
    } else {
      console.log(`❌ ${name}`);
      if (details) {
        console.log(`   ${details}`);
      }
    }
  }

  try {
    // Test 1: Configuration loading in crawler context
    console.log('📋 Test 1: Configuration Loading');
    
    // Simulate crawler environment variables
    process.env.CRAWLER_FREQUENCY = 'bi-weekly';
    process.env.CRAWLER_DAY_OF_WEEK = '1';
    process.env.CRAWLER_HOUR = '10';
    process.env.CRAWLER_TARGET_URLS = 'https://diabetes.org/about-diabetes/type-1,https://diabetes.org/about-diabetes/type-2';
    process.env.RETRY_ATTEMPTS = '5';
    
    const config = await configService.getCurrentConfiguration();
    
    test('Crawler frequency loaded correctly', config.frequency === 'bi-weekly');
    test('Crawler day of week loaded correctly', config.dayOfWeek === 1);
    test('Crawler hour loaded correctly', config.hour === 10);
    test('Crawler target URLs loaded correctly', config.targetUrls.length === 2);
    test('Crawler retry attempts loaded correctly', config.retryAttempts === 5);
    console.log();

    // Test 2: Frequency execution logic
    console.log('⏰ Test 2: Frequency Execution Logic');
    
    // Test weekly frequency (should always execute)
    const weeklyConfig = { ...config, frequency: 'weekly' as const };
    const weeklyValidation = configService.validateConfiguration(weeklyConfig);
    test('Weekly configuration is valid', weeklyValidation.isValid);
    
    // Test bi-weekly frequency configuration
    const biWeeklyConfig = { ...config, frequency: 'bi-weekly' as const };
    const biWeeklyValidation = configService.validateConfiguration(biWeeklyConfig);
    test('Bi-weekly configuration is valid', biWeeklyValidation.isValid);
    
    // Test monthly frequency configuration
    const monthlyConfig = { ...config, frequency: 'monthly' as const };
    const monthlyValidation = configService.validateConfiguration(monthlyConfig);
    test('Monthly configuration is valid', monthlyValidation.isValid);
    console.log();

    // Test 3: URL validation integration
    console.log('🔗 Test 3: URL Validation Integration');
    
    // Test valid diabetes.org URLs
    const validUrls = [
      'https://diabetes.org/about-diabetes/type-1',
      'https://diabetes.org/about-diabetes/type-2',
      'https://www.diabetes.org/living-with-diabetes'
    ];
    
    const validUrlConfig = { ...config, targetUrls: validUrls };
    const validUrlResult = configService.validateConfiguration(validUrlConfig);
    test('Valid diabetes.org URLs pass validation', validUrlResult.isValid);
    
    // Test mixed valid/invalid URLs
    const mixedUrls = [
      'https://diabetes.org/about-diabetes/type-1',
      'https://example.com/invalid',
      'https://diabetes.org/living-with-diabetes'
    ];
    
    const mixedUrlConfig = { ...config, targetUrls: mixedUrls };
    const mixedUrlResult = configService.validateConfiguration(mixedUrlConfig);
    test('Mixed URLs fail validation', !mixedUrlResult.isValid);
    test('Error mentions invalid domain', mixedUrlResult.errors.some(e => e.includes('example.com')));
    console.log();

    // Test 4: Configuration update simulation
    console.log('🔄 Test 4: Configuration Update Simulation');
    
    const updateConfig = {
      frequency: 'monthly' as const,
      dayOfWeek: 5, // Friday
      hour: 14,
      minute: 30,
      targetUrls: [
        'https://diabetes.org/about-diabetes',
        'https://diabetes.org/living-with-diabetes',
        'https://diabetes.org/tools-and-resources'
      ],
      retryAttempts: 2,
      timeoutMinutes: 20,
      notificationEmail: 'admin@example.com'
    };
    
    const updateValidation = configService.validateConfiguration(updateConfig);
    test('Update configuration is valid', updateValidation.isValid);
    
    // Simulate change detection
    const currentConfig = await configService.getCurrentConfiguration();
    const changedFields = Object.keys(updateConfig).filter(key => {
      if (key === 'targetUrls') {
        return JSON.stringify((currentConfig as any)[key]) !== JSON.stringify((updateConfig as any)[key]);
      }
      return (currentConfig as any)[key] !== (updateConfig as any)[key];
    });
    
    test('Configuration changes detected', changedFields.length > 0);
    test('Frequency change detected', changedFields.includes('frequency'));
    test('Target URLs change detected', changedFields.includes('targetUrls'));
    console.log();

    // Test 5: Error handling and fallbacks
    console.log('🛡️ Test 5: Error Handling and Fallbacks');
    
    // Test configuration with warnings
    const warningConfig = {
      targetUrls: [], // Empty URLs should generate warning
      retryAttempts: 10 // At the upper limit
    };
    
    const warningResult = configService.validateConfiguration(warningConfig);
    test('Configuration with warnings is valid', warningResult.isValid);
    test('Empty URLs generate warning', warningResult.warnings.length > 0);
    
    // Test configuration with errors
    const errorConfig = {
      frequency: 'invalid' as any,
      dayOfWeek: 10, // Invalid
      targetUrls: ['https://invalid-domain.com/test']
    };
    
    const errorResult = configService.validateConfiguration(errorConfig);
    test('Invalid configuration rejected', !errorResult.isValid);
    test('Multiple errors detected', errorResult.errors.length > 1);
    console.log();

    // Test 6: Environment variable precedence
    console.log('🌍 Test 6: Environment Variable Precedence');
    
    // Test with missing environment variables (should use defaults)
    delete process.env.CRAWLER_FREQUENCY;
    delete process.env.CRAWLER_DAY_OF_WEEK;
    
    const defaultConfig = await configService.getCurrentConfiguration();
    test('Missing env vars use defaults', defaultConfig.frequency === 'weekly');
    test('Missing day uses default', defaultConfig.dayOfWeek === 0);
    
    // Test with invalid environment variables (should use defaults)
    process.env.CRAWLER_FREQUENCY = 'invalid';
    process.env.CRAWLER_DAY_OF_WEEK = '10';
    process.env.CRAWLER_HOUR = '25';
    
    const fallbackConfig = await configService.getCurrentConfiguration();
    test('Invalid env vars use defaults', fallbackConfig.frequency === 'weekly');
    test('Invalid day uses default', fallbackConfig.dayOfWeek === 0);
    test('Invalid hour uses default', fallbackConfig.hour === 2);
    console.log();

    // Clean up environment variables
    delete process.env.CRAWLER_FREQUENCY;
    delete process.env.CRAWLER_DAY_OF_WEEK;
    delete process.env.CRAWLER_HOUR;
    delete process.env.CRAWLER_TARGET_URLS;
    delete process.env.RETRY_ATTEMPTS;

    // Summary
    console.log('📊 Integration Test Summary');
    console.log(`Tests passed: ${testsPassed}/${testsTotal}`);
    console.log(`Success rate: ${((testsPassed / testsTotal) * 100).toFixed(1)}%`);
    
    if (testsPassed === testsTotal) {
      console.log('🎉 All configuration integration tests passed!');
      console.log('\n✅ Configuration Integration Requirements Validated:');
      console.log('   ✓ Configuration loads correctly in crawler context');
      console.log('   ✓ Frequency validation works with crawler logic');
      console.log('   ✓ URL validation integrates with security requirements');
      console.log('   ✓ Configuration updates can be validated before application');
      console.log('   ✓ Error handling provides graceful fallbacks');
      console.log('   ✓ Environment variable precedence works correctly');
      return true;
    } else {
      console.log('❌ Some configuration integration tests failed');
      return false;
    }

  } catch (error) {
    console.error('❌ Configuration integration test failed:', error);
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  testConfigurationIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testConfigurationIntegration };