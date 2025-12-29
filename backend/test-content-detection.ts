#!/usr/bin/env ts-node

/**
 * Simple test for ContentDetectionService
 */

import { ContentDetectionService } from './src/services/content-detection-service';

async function testContentDetection() {
  console.log('Testing ContentDetectionService...');
  
  try {
    const service = new ContentDetectionService();
    
    // Test content hashing
    const testContent = `
      <html>
        <body>
          <h1>Test Article</h1>
          <p>This is a test article about diabetes.</p>
          <p>Published on 2024-01-15 10:30:00</p>
          <div class="advertisement">Ad content here</div>
        </body>
      </html>
    `;
    
    const testUrl = 'https://diabetes.org/test-article';
    
    console.log('1. Testing change detection for new content...');
    const result1 = await service.detectChanges(testUrl, testContent);
    console.log('Result:', {
      hasChanged: result1.hasChanged,
      changeType: result1.changeType,
      currentHash: result1.currentHash.substring(0, 16) + '...'
    });
    
    console.log('2. Testing change detection for same content...');
    const result2 = await service.detectChanges(testUrl, testContent);
    console.log('Result:', {
      hasChanged: result2.hasChanged,
      changeType: result2.changeType,
      hashesMatch: result1.currentHash === result2.currentHash
    });
    
    console.log('3. Testing change detection for modified content...');
    const modifiedContent = testContent.replace('test article', 'updated article');
    const result3 = await service.detectChanges(testUrl, modifiedContent);
    console.log('Result:', {
      hasChanged: result3.hasChanged,
      changeType: result3.changeType,
      hashesMatch: result1.currentHash === result3.currentHash
    });
    
    console.log('✅ ContentDetectionService test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

if (require.main === module) {
  testContentDetection();
}