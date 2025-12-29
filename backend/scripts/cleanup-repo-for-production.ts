#!/usr/bin/env ts-node

/**
 * Production Repository Cleanup Script
 * 
 * This script removes non-essential files from the ADA Clara backend repository
 * to prepare it for production deployment and frontend team handoff.
 * 
 * Categories of files to remove:
 * 1. Incremental test files and reports
 * 2. Development documentation summaries
 * 3. Temporary CDK output directories
 * 4. Legacy test scripts
 * 5. Validation reports and temporary files
 * 6. Unused lambda functions and stacks
 */

import * as fs from 'fs';
import * as path from 'path';

interface CleanupItem {
  path: string;
  type: 'file' | 'directory';
  reason: string;
  category: string;
}

class ProductionCleanup {
  private itemsToDelete: CleanupItem[] = [];
  private dryRun: boolean;

  constructor(dryRun: boolean = true) {
    this.dryRun = dryRun;
    this.defineCleanupItems();
  }

  private defineCleanupItems(): void {
    // 1. Incremental test files and reports
    this.addCleanupItems([
      // Test reports and validation files
      { path: 'DOC_CLEANUP_REPORT_1766969946967.json', type: 'file', reason: 'Temporary cleanup report', category: 'Reports' },
      { path: 'ENHANCED_CRAWLER_VALIDATION_REPORT_1766986140408.json', type: 'file', reason: 'Temporary validation report', category: 'Reports' },
      { path: 'EVENTBRIDGE_VALIDATION_REPORT_1766974107622.json', type: 'file', reason: 'Temporary validation report', category: 'Reports' },
      { path: 'EVENTBRIDGE_VALIDATION_REPORT_1766974353746.json', type: 'file', reason: 'Temporary validation report', category: 'Reports' },
      { path: 'TASK_5_2_SIMPLE_TEST_REPORT.json', type: 'file', reason: 'Temporary test report', category: 'Reports' },

      // Task completion summaries (development artifacts)
      { path: 'TASK_14_COMPLETION_SUMMARY.md', type: 'file', reason: 'Development task summary', category: 'Dev Docs' },
      { path: 'TASK_15_COMPLETION_SUMMARY.md', type: 'file', reason: 'Development task summary', category: 'Dev Docs' },
      { path: 'TASK_16_COMPLETION_SUMMARY.md', type: 'file', reason: 'Development task summary', category: 'Dev Docs' },

      // Incremental development documentation
      { path: 'CONFIGURATION_MANAGEMENT_SUMMARY.md', type: 'file', reason: 'Development summary, info in main docs', category: 'Dev Docs' },
      { path: 'PRODUCTION_STACK_ANALYSIS.md', type: 'file', reason: 'Development analysis, superseded by deployment guides', category: 'Dev Docs' },

      // Root-level test files (moved to proper test directory)
      { path: 'test-console.ts', type: 'file', reason: 'Ad-hoc test file, not part of test suite', category: 'Legacy Tests' },
      { path: 'test-content-detection.ts', type: 'file', reason: 'Ad-hoc test file, functionality in test/', category: 'Legacy Tests' },
      { path: 'test-enhanced-crawler.ts', type: 'file', reason: 'Ad-hoc test file, functionality in scripts/', category: 'Legacy Tests' },
      { path: 'test-error-resilience-integration.ts', type: 'file', reason: 'Ad-hoc test file, functionality in test/', category: 'Legacy Tests' },
      { path: 'test-eventbridge-simple.ts', type: 'file', reason: 'Ad-hoc test file, functionality in scripts/', category: 'Legacy Tests' },
      { path: 'test-import.ts', type: 'file', reason: 'Ad-hoc test file, not needed', category: 'Legacy Tests' },
      { path: 'test-minimal-stack.ts', type: 'file', reason: 'Ad-hoc test file, functionality in scripts/', category: 'Legacy Tests' },
      { path: 'test-s3-vectors-import.ts', type: 'file', reason: 'Ad-hoc test file, functionality in scripts/', category: 'Legacy Tests' },
      { path: 'test-s3-vectors-minimal.ts', type: 'file', reason: 'Ad-hoc test file, functionality in scripts/', category: 'Legacy Tests' },
      { path: 'test-stack-simple.ts', type: 'file', reason: 'Ad-hoc test file, functionality in scripts/', category: 'Legacy Tests' },
    ]);

    // 2. CDK output directories (should be regenerated)
    this.addCleanupItems([
      { path: 'cdk.out', type: 'directory', reason: 'CDK build artifacts, regenerated on deploy', category: 'Build Artifacts' },
      { path: 'cdk.out.temp', type: 'directory', reason: 'Temporary CDK artifacts', category: 'Build Artifacts' },
      { path: 'cdk.out.test', type: 'directory', reason: 'Test CDK artifacts', category: 'Build Artifacts' },
    ]);

    // 3. Legacy and unused lambda functions
    this.addCleanupItems([
      { path: 'lambda/bedrock-manager', type: 'directory', reason: 'Unused lambda function', category: 'Unused Code' },
      { path: 'lambda/crawler-test', type: 'directory', reason: 'Test lambda, not for production', category: 'Unused Code' },
      { path: 'lambda/custom-crawler', type: 'directory', reason: 'Superseded by bedrock-crawler', category: 'Unused Code' },
      { path: 'lambda/configuration-manager', type: 'directory', reason: 'Functionality moved to services', category: 'Unused Code' },
    ]);

    // 4. Redundant deployment scripts (keep only essential ones)
    this.addCleanupItems([
      { path: 'scripts/deploy-enhanced-faq.ts', type: 'file', reason: 'Functionality in main deployment scripts', category: 'Redundant Scripts' },
      { path: 'scripts/deploy-task15-enhanced-system.ts', type: 'file', reason: 'Task-specific deployment, use main scripts', category: 'Redundant Scripts' },
      { path: 'scripts/test-task6-2-performance-validation.ts', type: 'file', reason: 'Task-specific test, functionality in main tests', category: 'Redundant Scripts' },
      { path: 'scripts/test-faq-analysis.ts', type: 'file', reason: 'Specific test, functionality in comprehensive tests', category: 'Redundant Scripts' },
      { path: 'scripts/test-escalation-analytics.ts', type: 'file', reason: 'Specific test, functionality in comprehensive tests', category: 'Redundant Scripts' },
      { path: 'scripts/test-configuration-integration.ts', type: 'file', reason: 'Specific test, functionality in comprehensive tests', category: 'Redundant Scripts' },
      { path: 'scripts/test-configuration-management.ts', type: 'file', reason: 'Specific test, functionality in comprehensive tests', category: 'Redundant Scripts' },
      { path: 'scripts/test-crawler-monitoring.ts', type: 'file', reason: 'Specific test, functionality in comprehensive tests', category: 'Redundant Scripts' },
      { path: 'scripts/validate-enhanced-crawler-deployment.ts', type: 'file', reason: 'Validation script, functionality in main deployment', category: 'Redundant Scripts' },
      { path: 'scripts/validate-eventbridge-stack.ts', type: 'file', reason: 'Validation script, functionality in main deployment', category: 'Redundant Scripts' },
    ]);

    // 5. Unused bin files (keep only main backend.ts)
    this.addCleanupItems([
      { path: 'bin/opensearch-app.ts', type: 'file', reason: 'Unused app entry point', category: 'Unused Code' },
      { path: 'bin/rag-processor-app.ts', type: 'file', reason: 'Unused app entry point', category: 'Unused Code' },
    ]);

    // 6. Comprehensive test directory (keep unit tests, remove extensive test data)
    this.addCleanupItems([
      { path: 'test/comprehensive', type: 'directory', reason: 'Extensive test suite, keep unit tests only', category: 'Test Cleanup' },
      { path: 'test/test-data/realistic', type: 'directory', reason: 'Large test datasets, not needed for production', category: 'Test Cleanup' },
    ]);

    // 7. Unused services (keep only essential ones)
    this.addCleanupItems([
      { path: 'src/services/configuration-service.ts', type: 'file', reason: 'Functionality moved to environment variables', category: 'Unused Code' },
      { path: 'src/services/crawler-monitoring-service.ts', type: 'file', reason: 'Monitoring handled by CloudWatch', category: 'Unused Code' },
      { path: 'src/services/security-validation-service.ts', type: 'file', reason: 'Security handled by WAF and IAM', category: 'Unused Code' },
      { path: 'src/services/content-detection-service.ts', type: 'file', reason: 'Functionality integrated into main crawler', category: 'Unused Code' },
    ]);
  }

  private addCleanupItems(items: Omit<CleanupItem, 'path'>[] & { path: string }[]): void {
    items.forEach(item => {
      this.itemsToDelete.push({
        path: path.join(process.cwd(), item.path),
        type: item.type,
        reason: item.reason,
        category: item.category
      });
    });
  }

  private async deleteItem(item: CleanupItem): Promise<boolean> {
    try {
      if (!fs.existsSync(item.path)) {
        console.log(`⚠️  ${item.path} does not exist, skipping`);
        return true;
      }

      if (item.type === 'directory') {
        await fs.promises.rm(item.path, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(item.path);
      }
      
      console.log(`✅ Deleted ${item.type}: ${path.relative(process.cwd(), item.path)}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete ${item.path}:`, error);
      return false;
    }
  }

  private printSummary(): void {
    const categories = [...new Set(this.itemsToDelete.map(item => item.category))];
    
    console.log('\n📋 CLEANUP SUMMARY');
    console.log('==================');
    
    categories.forEach(category => {
      const items = this.itemsToDelete.filter(item => item.category === category);
      console.log(`\n${category} (${items.length} items):`);
      items.forEach(item => {
        const relativePath = path.relative(process.cwd(), item.path);
        console.log(`  • ${relativePath} - ${item.reason}`);
      });
    });

    console.log(`\nTotal items to clean: ${this.itemsToDelete.length}`);
    
    if (this.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No files will be deleted');
      console.log('Run with --execute to perform actual cleanup');
    }
  }

  async execute(): Promise<void> {
    console.log('🧹 ADA Clara Production Repository Cleanup');
    console.log('==========================================\n');

    this.printSummary();

    if (this.dryRun) {
      return;
    }

    console.log('\n🚀 Starting cleanup...\n');

    let successCount = 0;
    let failureCount = 0;

    for (const item of this.itemsToDelete) {
      const success = await this.deleteItem(item);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    console.log('\n📊 CLEANUP RESULTS');
    console.log('==================');
    console.log(`✅ Successfully deleted: ${successCount} items`);
    console.log(`❌ Failed to delete: ${failureCount} items`);
    console.log(`📁 Total processed: ${this.itemsToDelete.length} items`);

    if (failureCount === 0) {
      console.log('\n🎉 Repository cleanup completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Review remaining files');
      console.log('2. Update README.md with production setup instructions');
      console.log('3. Commit cleaned repository');
      console.log('4. Share with frontend team');
    } else {
      console.log('\n⚠️  Some items could not be deleted. Please review and clean manually.');
    }
  }

  // Method to create a backup before cleanup
  async createBackup(): Promise<void> {
    const backupDir = path.join(process.cwd(), '..', `ada-clara-backup-${Date.now()}`);
    console.log(`📦 Creating backup at: ${backupDir}`);
    
    try {
      await fs.promises.cp(process.cwd(), backupDir, { 
        recursive: true,
        filter: (src) => {
          // Skip node_modules and cdk.out directories in backup
          return !src.includes('node_modules') && !src.includes('cdk.out');
        }
      });
      console.log('✅ Backup created successfully');
    } catch (error) {
      console.error('❌ Failed to create backup:', error);
      throw error;
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const backup = args.includes('--backup');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
🧹 ADA Clara Production Repository Cleanup

Usage: npx ts-node scripts/cleanup-repo-for-production.ts [options]

Options:
  --execute    Actually perform the cleanup (default is dry-run)
  --backup     Create a backup before cleanup
  --help, -h   Show this help message

Examples:
  # Dry run (preview what will be deleted)
  npx ts-node scripts/cleanup-repo-for-production.ts

  # Create backup and perform cleanup
  npx ts-node scripts/cleanup-repo-for-production.ts --backup --execute

  # Just perform cleanup
  npx ts-node scripts/cleanup-repo-for-production.ts --execute
`);
    return;
  }

  const cleanup = new ProductionCleanup(!execute);

  try {
    if (backup && execute) {
      await cleanup.createBackup();
    }
    
    await cleanup.execute();
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { ProductionCleanup };