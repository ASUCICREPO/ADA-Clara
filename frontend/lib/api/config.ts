/**
 * API Configuration
 * Fetches runtime configuration from /runtime-config.json
 * This file is generated at build time with values from CDK stack outputs
 */

export interface ApiConfig {
  apiBaseUrl: string;
  region: string;
  cognito: {
    userPoolId: string;
    clientId: string;
    identityPoolId: string;
    domain: string;
    redirectSignIn: string;
    redirectSignOut: string;
  };
  version?: string; // For debugging/cache busting
}

// Cached configuration
let cachedConfig: ApiConfig | null = null;
let configPromise: Promise<ApiConfig> | null = null;

/**
 * Fetch configuration from runtime-config.json
 * This file is generated at build time with values from CDK stack outputs
 */
async function fetchRuntimeConfig(): Promise<ApiConfig> {
  try {
    console.log('[Config] Fetching runtime configuration...');

    const response = await fetch('/runtime-config.json', {
      cache: 'no-store', // Always fetch fresh config
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
    }

    const config: ApiConfig = await response.json();

    console.log('[Config] Runtime configuration loaded successfully', {
      apiBaseUrl: config.apiBaseUrl,
      version: config.version,
    });

    return config;
  } catch (error) {
    console.error('[Config] Failed to fetch runtime configuration:', error);
    throw new Error(`
Failed to load application configuration.

This usually means:
1. The application was not built correctly, or
2. The runtime-config.json file is missing

Error: ${error instanceof Error ? error.message : 'Unknown error'}
`);
  }
}

/**
 * Get the current API configuration
 * Fetches from backend on first call, then caches
 */
export async function getConfig(): Promise<ApiConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // If a fetch is in progress, wait for it
  if (configPromise) {
    return configPromise;
  }

  // Start fetching config
  configPromise = fetchRuntimeConfig();

  try {
    cachedConfig = await configPromise;
    return cachedConfig;
  } finally {
    configPromise = null;
  }
}

/**
 * Synchronous config getter for backwards compatibility
 * Returns cached config or throws if not loaded yet
 * @deprecated Use getConfig() instead
 */
export function getConfigSync(): ApiConfig {
  if (!cachedConfig) {
    throw new Error('Configuration not loaded. Call getConfig() first.');
  }
  return cachedConfig;
}

