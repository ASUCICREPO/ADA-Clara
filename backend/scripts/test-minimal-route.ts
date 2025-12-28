#!/usr/bin/env ts-node

/**
 * Minimal route test to debug the issue
 */

// Test if the route handler can be called directly
async function testMinimalRoute(): Promise<void> {
  console.log('🔍 Testing minimal route handler');
  
  // Simulate the exact same logic as in the handler
  const path = '/admin/conversations';
  const method = 'GET';
  const queryParams = { startDate: '2024-01-01', endDate: '2024-01-31' };
  
  console.log(`Path: ${path}`);
  console.log(`Method: ${method}`);
  console.log(`Query params:`, queryParams);
  
  // Test the condition
  if (method === 'GET') {
    console.log('✅ Method check passed');
    
    if (path === '/admin/conversations') {
      console.log('✅ Path check passed');
      console.log('🎯 Route should be handled here');
    } else {
      console.log('❌ Path check failed');
      console.log(`Expected: '/admin/conversations', Got: '${path}'`);
    }
  } else {
    console.log('❌ Method check failed');
  }
}

testMinimalRoute().catch(console.error);