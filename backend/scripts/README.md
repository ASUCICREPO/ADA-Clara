# ADA Clara Scripts

This directory contains utility scripts for managing the ADA Clara deployment.

## trigger-web-scraper.sh

**Purpose**: Manually trigger the web scraper pipeline to refresh the Knowledge Base with latest content from diabetes.org.

**When to use**:
- During initial deployment (automatically called by `deploy.sh`)
- To manually refresh KB content between the weekly scheduled scrapes
- After making changes to the web scraper configuration
- When diabetes.org publishes important new content that needs immediate ingestion

**What it does**:
1. Discovers up to 1200 high-quality URLs from diabetes.org
2. Queues content batches for parallel processing
3. Processes and stores content in S3
4. **Automatically triggers KB ingestion** via sentinel messages (no manual ingestion needed)
5. Updates the Knowledge Base with new embeddings

**Usage**:
```bash
./backend/scripts/trigger-web-scraper.sh
```

**Timeline**: ~20-25 minutes for complete KB population
- Content scraping: 15-20 minutes
- Automatic KB ingestion: 5 minutes after content processing completes

**Note**: The Knowledge Base is automatically updated every Sunday at 2 AM UTC via EventBridge. Manual triggering is only needed for immediate updates.
