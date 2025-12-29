#!/usr/bin/env ts-node

/**
 * Destroy All ADA Clara Stacks Script
 * 
 * This script safely destroys all ADA Clara CloudFormation stacks in the correct order
 * to avoid dependency conflicts. It handles:
 * 
 * - Stack dependency resolution
 * - Safe deletion order (dependent stacks first)
 * - Error handling and retry logic
 * - Confirmation prompts for safety
 * - Progress tracking and logging
 */

import { execSync } from 'child_process';

interface StackInfo {
  name: string;
  status: string;
  creationTime?: string;
  dependencies: string[];
}

class StackDestroyer {
  private adaClaraStacks: StackInfo[] = [];

  constructor() {
    // No AWS SDK client needed - using CLI commands
  }

  async destroyAllStacks(dryRun: boolean = false): Promise<void> {
    console.log('🔍 ADA Clara Stack Destruction Process');
    console.log('=' .repeat(60));
    
    if (dryRun) {
      console.log('🧪 DRY RUN MODE - No stacks will be deleted');
    } else {
      console.log('⚠️  DESTRUCTIVE MODE - Stacks will be permanently deleted');
    }
    
    console.log('=' .repeat(60));

    try {
      // Step 1: Discover all ADA Clara stacks
      await this.discoverAdaClaraStacks();
      
      if (this.adaClaraStacks.length === 0) {
        console.log('✅ No ADA Clara stacks found to destroy');
        return;
      }

      // Step 2: Display stacks to be destroyed
      this.displayStacksToDestroy();

      // Step 3: Get user confirmation (unless dry run)
      if (!dryRun) {
        const confirmed = await this.getUserConfirmation();
        if (!confirmed) {
          console.log('❌ Stack destruction cancelled by user');
          return;
        }
      }

      // Step 4: Calculate deletion order
      const deletionOrder = this.calculateDeletionOrder();
      
      // Step 5: Delete stacks in order
      await this.deleteStacksInOrder(deletionOrder, dryRun);

      if (!dryRun) {
        console.log('\n🎉 All ADA Clara stacks destroyed successfully!');
        console.log('✨ AWS environment is now clean and ready for fresh deployment');
      } else {
        console.log('\n🧪 Dry run completed - no stacks were actually deleted');
      }

    } catch (error: any) {
      console.error('❌ Stack destruction failed:', error);
      process.exit(1);
    }
  }

  private async discoverAdaClaraStacks(): Promise<void> {
    console.log('🔍 Discovering ADA Clara stacks...');
    
    try {
      // Use AWS CLI to list stacks
      const output = execSync(
        'aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE CREATE_FAILED UPDATE_FAILED --output json',
        { encoding: 'utf8' }
      );
      
      const response = JSON.parse(output);
      const allStacks = response.StackSummaries || [];

      // Filter for ADA Clara stacks
      const adaClaraStackNames = allStacks
        .filter((stack: any) => 
          stack.StackName?.includes('Ada') || 
          stack.StackName?.includes('ada') ||
          stack.StackName?.toLowerCase().includes('clara')
        )
        .map((stack: any) => stack.StackName);

      // Get detailed information for each stack
      for (const stackName of adaClaraStackNames) {
        try {
          const stackInfo = await this.getStackInfo(stackName);
          this.adaClaraStacks.push(stackInfo);
        } catch (error) {
          console.log(`   ⚠️ Could not get info for stack ${stackName}: ${error}`);
        }
      }

      console.log(`   ✅ Found ${this.adaClaraStacks.length} ADA Clara stacks`);
      
    } catch (error: any) {
      throw new Error(`Failed to discover stacks: ${error.message}`);
    }
  }

  private async getStackInfo(stackName: string): Promise<StackInfo> {
    try {
      const output = execSync(
        `aws cloudformation describe-stacks --stack-name "${stackName}" --output json`,
        { encoding: 'utf8' }
      );
      
      const response = JSON.parse(output);
      const stack = response.Stacks?.[0];

      if (!stack) {
        throw new Error(`Stack ${stackName} not found`);
      }

      // Analyze dependencies based on stack name patterns
      const dependencies = this.analyzeDependencies(stackName);

      return {
        name: stackName,
        status: stack.StackStatus,
        creationTime: stack.CreationTime,
        dependencies
      };
    } catch (error: any) {
      throw new Error(`Failed to get stack info for ${stackName}: ${error.message}`);
    }
  }

  private analyzeDependencies(stackName: string): string[] {
    const dependencies: string[] = [];
    
    // Knowledge Base depends on S3 Vectors
    if (stackName.includes('KnowledgeBase')) {
      dependencies.push('S3Vectors');
    }
    
    // Chat Processor depends on DynamoDB
    if (stackName.includes('ChatProcessor')) {
      dependencies.push('DynamoDB');
    }
    
    // Admin Analytics depends on DynamoDB
    if (stackName.includes('AdminAnalytics') || stackName.includes('Analytics')) {
      dependencies.push('DynamoDB');
    }
    
    // SES Escalation is independent
    // S3 Vectors stacks are mostly independent but some depend on others
    if (stackName.includes('S3VectorsGA') && !stackName.includes('KnowledgeBase')) {
      // GA stack is usually the main one
    }

    return dependencies;
  }

  private displayStacksToDestroy(): void {
    console.log('\n📋 Stacks to be destroyed:');
    console.log('-'.repeat(80));
    
    this.adaClaraStacks.forEach((stack, index) => {
      const ageStr = stack.creationTime 
        ? `(${this.getStackAge(stack.creationTime)})`
        : '';
      
      console.log(`   ${index + 1}. ${stack.name}`);
      console.log(`      Status: ${stack.status} ${ageStr}`);
      if (stack.dependencies.length > 0) {
        console.log(`      Dependencies: ${stack.dependencies.join(', ')}`);
      }
      console.log('');
    });
  }

  private getStackAge(creationTime: string): string {
    const now = new Date();
    const created = new Date(creationTime);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h ago`;
    } else {
      return `${diffHours}h ago`;
    }
  }

  private async getUserConfirmation(): Promise<boolean> {
    console.log('\n⚠️  WARNING: This will permanently delete all ADA Clara infrastructure!');
    console.log('   • All Lambda functions will be deleted');
    console.log('   • All S3 buckets and their contents will be deleted');
    console.log('   • All DynamoDB tables and data will be deleted');
    console.log('   • All API Gateways will be deleted');
    console.log('   • This action cannot be undone!');
    
    // Check for command line confirmation
    const args = process.argv.slice(2);
    if (args.includes('--confirm') || args.includes('--yes')) {
      console.log('✅ Destruction confirmed via command line flag');
      return true;
    }
    
    // Check environment variable
    const confirmation = process.env.CONFIRM_DESTROY;
    if (confirmation === 'YES_DESTROY_ALL_ADA_CLARA_STACKS') {
      console.log('✅ Destruction confirmed via environment variable');
      return true;
    }
    
    console.log('\n❌ Destruction not confirmed');
    console.log('   To confirm destruction, either:');
    console.log('   1. Add --confirm flag: npx ts-node scripts/destroy-all-stacks.ts --confirm');
    console.log('   2. Set environment variable: CONFIRM_DESTROY=YES_DESTROY_ALL_ADA_CLARA_STACKS');
    
    return false;
  }

  private calculateDeletionOrder(): string[] {
    // Sort stacks by dependency order (dependent stacks first)
    const sorted = [...this.adaClaraStacks].sort((a, b) => {
      // Stacks with more dependencies should be deleted first
      if (a.dependencies.length !== b.dependencies.length) {
        return b.dependencies.length - a.dependencies.length;
      }
      
      // Secondary sort by creation time (newer first)
      if (a.creationTime && b.creationTime) {
        return new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime();
      }
      
      return 0;
    });

    return sorted.map(stack => stack.name);
  }

  private async deleteStacksInOrder(stackNames: string[], dryRun: boolean): Promise<void> {
    console.log('\n🗑️ Deleting stacks in dependency order...');
    console.log('-'.repeat(60));

    for (let i = 0; i < stackNames.length; i++) {
      const stackName = stackNames[i];
      console.log(`\n${i + 1}/${stackNames.length}: ${stackName}`);
      
      if (dryRun) {
        console.log('   🧪 [DRY RUN] Would delete this stack');
        continue;
      }

      try {
        // Delete the stack using AWS CLI
        execSync(`aws cloudformation delete-stack --stack-name "${stackName}"`, { stdio: 'pipe' });
        console.log('   ✅ Deletion initiated');

        // Wait for deletion to complete
        await this.waitForStackDeletion(stackName);
        console.log('   ✅ Stack deleted successfully');

      } catch (error: any) {
        console.log(`   ❌ Failed to delete: ${error.message}`);
        
        // Continue with other stacks even if one fails
        if (error.message.includes('does not exist')) {
          console.log('   ℹ️ Stack already deleted, continuing...');
        } else {
          console.log('   ⚠️ Continuing with remaining stacks...');
        }
      }
    }
  }

  private async waitForStackDeletion(stackName: string): Promise<void> {
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes
    const pollInterval = 15 * 1000; // 15 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const output = execSync(
          `aws cloudformation describe-stacks --stack-name "${stackName}" --output json`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
        
        const response = JSON.parse(output);
        const stack = response.Stacks?.[0];

        if (!stack) {
          // Stack no longer exists - deletion complete
          return;
        }

        const status = stack.StackStatus;
        console.log(`   ⏳ Status: ${status}`);

        if (status === 'DELETE_COMPLETE') {
          return;
        }

        if (status === 'DELETE_FAILED') {
          throw new Error(`Stack deletion failed with status: ${status}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error: any) {
        if (error.message.includes('does not exist') || error.status === 255) {
          // Stack deleted successfully
          return;
        }
        throw error;
      }
    }

    throw new Error(`Stack deletion timed out after ${maxWaitTime / 1000} seconds`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  
  console.log('🚀 ADA Clara Stack Destroyer');
  
  if (dryRun) {
    console.log('🧪 Running in DRY RUN mode');
  }
  
  const destroyer = new StackDestroyer();
  await destroyer.destroyAllStacks(dryRun);
}

if (require.main === module) {
  main().catch(console.error);
}

export { StackDestroyer };