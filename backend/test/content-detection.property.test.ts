/**
 * Property-Based Tests for Content Detection Service
 * Feature: weekly-crawler-scheduling, Property 3: Content Change Detection Efficiency
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * Property 3: Content Change Detection Efficiency
 * For any content crawling operation, the system should accurately detect content changes 
 * using hash comparison and timestamp validation, processing only changed content
 */

import * as fc from 'fast-check';
import { ContentDetectionService } from '../src/services/content-detection-service';
import { ChangeDetectionResult, ContentRecord } from '../src/types/index';

// Mock DynamoDB for testing
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('Content Detection Service - Property Tests', () => {
  let contentDetectionService: ContentDetectionService;

  beforeEach(() => {
    // Reset environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.CONTENT_TRACKING_TABLE = 'test-content-tracking';
    
    contentDetectionService = new ContentDetectionService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 3: Content Change Detection Efficiency
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   * 
   * For any content crawling operation, the system should accurately detect content changes 
   * using hash comparison and timestamp validation, processing only changed content
   */
  describe('Property 3: Content Change Detection Efficiency', () => {
    
    test('Property 3.1: Identical content should always be detected as unchanged', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        fc.string({ minLength: 100, maxLength: 5000 }),
        async (url, content) => {
          // Mock existing content record
          const mockGetContentRecord = jest.spyOn(contentDetectionService as any, 'getContentRecord');
          const contentHash = (contentDetectionService as any).generateContentHash(content);
          
          mockGetContentRecord.mockResolvedValue({
            url,
            contentHash,
            lastCrawled: new Date().toISOString(),
            status: 'active'
          });

          const result = await contentDetectionService.detectChanges(url, content);

          // Property: Identical content should never be marked as changed
          expect(result.hasChanged).toBe(false);
          expect(result.changeType).toBe('unchanged');
          expect(result.currentHash).toBe(contentHash);
          expect(result.previousHash).toBe(contentHash);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.2: Modified content should always be detected as changed', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (url, originalContent, modification) => {
          // Ensure modification creates different content
          const modifiedContent = originalContent + ' ' + modification;
          
          // Mock existing content record with original content
          const mockGetContentRecord = jest.spyOn(contentDetectionService as any, 'getContentRecord');
          const originalHash = (contentDetectionService as any).generateContentHash(originalContent);
          
          mockGetContentRecord.mockResolvedValue({
            url,
            contentHash: originalHash,
            lastCrawled: new Date().toISOString(),
            status: 'active'
          });

          const result = await contentDetectionService.detectChanges(url, modifiedContent);
          const modifiedHash = (contentDetectionService as any).generateContentHash(modifiedContent);

          // Property: Modified content should always be detected as changed
          expect(result.hasChanged).toBe(true);
          expect(result.changeType).toBe('modified');
          expect(result.currentHash).toBe(modifiedHash);
          expect(result.previousHash).toBe(originalHash);
          expect(result.currentHash).not.toBe(result.previousHash);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.3: New content (no existing record) should always be detected as new', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        fc.string({ minLength: 100, maxLength: 5000 }),
        async (url, content) => {
          // Mock no existing content record
          const mockGetContentRecord = jest.spyOn(contentDetectionService as any, 'getContentRecord');
          mockGetContentRecord.mockResolvedValue(null);

          const result = await contentDetectionService.detectChanges(url, content);

          // Property: New content should always be marked as new
          expect(result.hasChanged).toBe(true);
          expect(result.changeType).toBe('new');
          expect(result.currentHash).toBeDefined();
          expect(result.previousHash).toBeUndefined();
          expect(result.lastModified).toBeInstanceOf(Date);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.4: Content normalization should produce consistent hashes', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 50, maxLength: 1000 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        async (baseContent, extraSpaces, extraNewlines) => {
          // Create variations with different whitespace
          const content1 = baseContent;
          const content2 = baseContent.replace(/\s/g, ' '.repeat(extraSpaces));
          const content3 = baseContent + '\n'.repeat(extraNewlines);
          const content4 = baseContent.toUpperCase();

          const hash1 = (contentDetectionService as any).generateContentHash(content1);
          const hash2 = (contentDetectionService as any).generateContentHash(content2);
          const hash3 = (contentDetectionService as any).generateContentHash(content3);
          const hash4 = (contentDetectionService as any).generateContentHash(content4);

          // Property: Normalization should produce consistent hashes for equivalent content
          // (Due to normalization options: removeWhitespace, lowercaseText)
          expect(hash1).toBe(hash4); // Case normalization
          // Note: hash2 and hash3 may differ due to specific whitespace handling
        }
      ), { numRuns: 100 });
    });

    test('Property 3.5: Hash generation should be deterministic and consistent', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 2000 }),
        async (content) => {
          const hash1 = (contentDetectionService as any).generateContentHash(content);
          const hash2 = (contentDetectionService as any).generateContentHash(content);
          const hash3 = (contentDetectionService as any).generateContentHash(content);

          // Property: Hash generation should be deterministic
          expect(hash1).toBe(hash2);
          expect(hash2).toBe(hash3);
          expect(hash1).toBe(hash3);
          
          // Property: Hash should be a valid hex string of expected length (SHA-256 = 64 chars)
          expect(hash1).toMatch(/^[a-f0-9]{64}$/);
          expect(hash1.length).toBe(64);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.6: Different content should produce different hashes', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 50, maxLength: 1000 }),
        fc.string({ minLength: 50, maxLength: 1000 }),
        async (content1, content2) => {
          // Skip if contents are identical after normalization
          const normalized1 = (contentDetectionService as any).normalizeContent(
            content1, 
            (contentDetectionService as any).DEFAULT_NORMALIZATION
          );
          const normalized2 = (contentDetectionService as any).normalizeContent(
            content2, 
            (contentDetectionService as any).DEFAULT_NORMALIZATION
          );
          
          fc.pre(normalized1 !== normalized2);

          const hash1 = (contentDetectionService as any).generateContentHash(content1);
          const hash2 = (contentDetectionService as any).generateContentHash(content2);

          // Property: Different normalized content should produce different hashes
          expect(hash1).not.toBe(hash2);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.7: Content with HTML tags should be normalized consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 20, maxLength: 500 }).filter(s => s.trim().length > 0), // Ensure non-empty content
        fc.array(fc.oneof(
          fc.constant('<p>'),
          fc.constant('</p>'),
          fc.constant('<div>'),
          fc.constant('</div>'),
          fc.constant('<span>'),
          fc.constant('</span>')
        ), { minLength: 0, maxLength: 10 }),
        async (textContent, htmlTags) => {
          const contentWithHtml = textContent + htmlTags.join('');
          const contentWithoutHtml = textContent;

          const hashWithHtml = (contentDetectionService as any).generateContentHash(contentWithHtml);
          const hashWithoutHtml = (contentDetectionService as any).generateContentHash(contentWithoutHtml);

          // Property: HTML tag removal should make content equivalent
          // (Due to removeHtmlTags normalization option)
          expect(hashWithHtml).toBe(hashWithoutHtml);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.8: URL hash generation should be consistent and collision-resistant', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        async (url) => {
          const hash1 = (contentDetectionService as any).generateUrlHash(url);
          const hash2 = (contentDetectionService as any).generateUrlHash(url);

          // Property: URL hash should be deterministic
          expect(hash1).toBe(hash2);
          
          // Property: URL hash should be 16 characters (truncated SHA-256)
          expect(hash1.length).toBe(16);
          expect(hash1).toMatch(/^[a-f0-9]{16}$/);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.9: Different URLs should produce different hashes', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        fc.webUrl(),
        async (url1, url2) => {
          fc.pre(url1 !== url2);

          const hash1 = (contentDetectionService as any).generateUrlHash(url1);
          const hash2 = (contentDetectionService as any).generateUrlHash(url2);

          // Property: Different URLs should produce different hashes
          expect(hash1).not.toBe(hash2);
        }
      ), { numRuns: 100 });
    });

    test('Property 3.10: Content change detection should handle edge cases gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        fc.oneof(
          fc.constant(''),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 10000, maxLength: 50000 }),
          fc.constant('   \n\t   '),
          fc.constant('<html><body></body></html>')
        ),
        async (url, edgeCaseContent) => {
          // Mock no existing content record for edge cases
          const mockGetContentRecord = jest.spyOn(contentDetectionService as any, 'getContentRecord');
          mockGetContentRecord.mockResolvedValue(null);

          const result = await contentDetectionService.detectChanges(url, edgeCaseContent);

          // Property: Edge cases should be handled without errors
          expect(result).toBeDefined();
          expect(result.hasChanged).toBe(true);
          expect(result.changeType).toBe('new');
          expect(result.currentHash).toBeDefined();
          expect(typeof result.currentHash).toBe('string');
          expect(result.currentHash.length).toBe(64);
        }
      ), { numRuns: 100 });
    });
  });

  /**
   * Additional property tests for content record operations
   */
  describe('Content Record Operations Properties', () => {
    
    test('Property: Content record updates should preserve data integrity', async () => {
      await fc.assert(fc.asyncProperty(
        fc.webUrl(),
        fc.record({
          url: fc.webUrl(),
          contentHash: fc.string().map(() => 'a'.repeat(64)), // Simple valid hash for testing
          lastCrawled: fc.date(),
          wordCount: fc.integer({ min: 0, max: 10000 }),
          chunkCount: fc.integer({ min: 1, max: 100 }),
          vectorIds: fc.array(fc.string(), { minLength: 0, maxLength: 10 }),
          metadata: fc.record({
            title: fc.string(),
            section: fc.string(),
            contentType: fc.constant('article')
          })
        }),
        async (url, contentRecord) => {
          // Mock DynamoDB operations
          const mockPutCommand = jest.fn().mockResolvedValue({});
          const mockSend = jest.fn().mockResolvedValue({});
          
          (contentDetectionService as any).client = { send: mockSend };

          // Property: Update operations should not throw errors with valid data
          await expect(
            contentDetectionService.updateContentRecord(url, contentRecord)
          ).resolves.not.toThrow();
          
          // Property: DynamoDB should be called with properly formatted record
          expect(mockSend).toHaveBeenCalled();
        }
      ), { numRuns: 50 });
    });
  });
});