#!/usr/bin/env ts-node

/**
 * Enhanced Crawler Scheduling Health Check
 * 
 * This script validates the complete weekly crawler scheduling system including:
 * - EventBridge rule configuration and status
 * - SNS topic setup and subscriptions
 * - Content tracking table creation and GSI
 * - Lam