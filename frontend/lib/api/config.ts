/**
 * API Configuration
 * Fetches runtime configuration from the backend /config endpoint
 * This allows the frontend to work across deployments without rebuilding
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
 * Fetch configuration from the backend /config endpoint
 * Falls back to environment variables for local development
 */
async function fetchRuntimeConfig(): Promise<ApiConfig> {
  // Try environment variable first (for local development or fallback)
  const envApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (envApiBaseUrl) {
    console.log('[Config] Using environment variables (local development mode)');
    return {
      apiBaseUrl: envApiBaseUrl.endsWith('/') ? envApiBaseUrl.slice(0, -1) : envApiBaseUrl,
      region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-west-2',
      cognito: {
        userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
        clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
        identityPoolId: process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID || '',
        domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '',
        redirectSignIn: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_IN || `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
        redirectSignOut: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_OUT || (typeof window !== 'undefined' ? window.location.origin : ''),
      },
    };
  }

  // Fetch from backend /config endpoint (production mode)
  console.log('[Config] Fetching runtime configuration from backend...');

  // Get API URL from global window object (set during build in layout.tsx)
  const apiBaseUrl = typeof window !== 'undefined' && (window as any).__API_BASE_URL__
    ? (window as any).__API_BASE_URL__
    : 'https://placeholder.execute-api.us-west-2.amazonaws.com/prod';

  if (apiBaseUrl.includes('placeholder')) {
    throw new Error('API base URL not configured. __API_BASE_URL__ must be set.');
  }

  try {
    const response = await fetch(`${apiBaseUrl}/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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
Failed to load application configuration from backend.

This usually means:
1. The backend API is not deployed yet, or
2. There's a CORS issue, or
3. The API Gateway URL has changed

For local development:
Create a .env.local file with NEXT_PUBLIC_API_BASE_URL set to your API Gateway URL.

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

