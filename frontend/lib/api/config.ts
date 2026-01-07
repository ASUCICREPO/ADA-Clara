/**
 * API Configuration
 * All values are dynamically loaded from environment variables
 * No hardcoded values - everything comes from AWS/CDK
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
}

/**
 * Get API configuration from environment variables
 * These will be injected by CDK/Amplify during deployment
 */
export function getApiConfig(): ApiConfig {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const region = process.env.NEXT_PUBLIC_AWS_REGION || process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-west-2';
  
  if (!apiBaseUrl) {
    const errorMessage = `
NEXT_PUBLIC_API_BASE_URL is not set. 

For local development:
1. Copy frontend/.env.local.example to frontend/.env.local
2. Fill in the values from your deployed stack:
   aws cloudformation describe-stacks --stack-name AdaClaraUnifiedStack --query "Stacks[0].Outputs" --region us-west-2
3. Or get values from AWS Console: CloudFormation → AdaClaraUnifiedStack → Outputs tab

Required environment variables:
- NEXT_PUBLIC_API_BASE_URL (from ApiGatewayUrl output)
- NEXT_PUBLIC_COGNITO_USER_POOL_ID (from UserPoolId output)
- NEXT_PUBLIC_COGNITO_CLIENT_ID (from UserPoolClientId output)
- NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID (from IdentityPoolId output)
- NEXT_PUBLIC_COGNITO_DOMAIN (from CognitoDomain output)
`;
    throw new Error(errorMessage);
  }

  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const identityPoolId = process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID;
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const redirectSignIn = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_IN || `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;
  const redirectSignOut = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_OUT || (typeof window !== 'undefined' ? window.location.origin : '');

  // Cognito is optional for public endpoints, but required for admin
  if (!userPoolId || !clientId || !identityPoolId || !domain) {
    console.warn('Cognito configuration is incomplete. Admin features will not work.');
  }

  return {
    apiBaseUrl: apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl,
    region,
    cognito: {
      userPoolId: userPoolId || '',
      clientId: clientId || '',
      identityPoolId: identityPoolId || '',
      domain: domain || '',
      redirectSignIn,
      redirectSignOut,
    },
  };
}

/**
 * Get the current API configuration
 * Cached to avoid repeated environment variable reads
 */
let cachedConfig: ApiConfig | null = null;

export function getConfig(): ApiConfig {
  if (!cachedConfig) {
    cachedConfig = getApiConfig();
  }
  return cachedConfig;
}

