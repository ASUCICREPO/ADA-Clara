/**
 * Simplified Auth Handler Lambda for ADA Clara
 * 
 * Handles JWT token validation for admin users only.
 * Public users don't need authentication.
 */

import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { verify, decode } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

interface CognitoJWTPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  'cognito:username': string;
  'custom:user_type'?: string;
  'custom:language_preference'?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  token_use: string;
}

interface AdminUserContext {
  userId: string;
  username: string;
  email: string;
  userType: 'admin';
  isVerified: boolean;
  languagePreference: 'en' | 'es';
  permissions: string[];
}

interface AuthResponse {
  isAuthorized: boolean;
  userContext?: AdminUserContext;
  error?: string;
  statusCode: number;
}

class SimplifiedAuthHandler {
  private cognitoClient: CognitoIdentityProviderClient;
  private jwksClient: JwksClient;
  private userPoolId: string;
  private region: string;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION || 'us-east-1' });
    
    this.userPoolId = process.env.USER_POOL_ID!;
    this.region = process.env.REGION || 'us-east-1';
    
    // JWKS client for JWT verification
    this.jwksClient = new JwksClient({
      jwksUri: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }

  /**
   * Main handler for authentication requests
   */
  async handleAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('🔐 Simplified Auth Handler started');
    
    const path = event.path;
    const method = event.httpMethod;

    try {
      if (method === 'GET' && path === '/admin/auth/health') {
        return this.handleHealthCheck();
      } else if (method === 'POST' && path === '/admin/auth') {
        return await this.handleTokenValidation(event);
      } else if (method === 'GET' && path === '/admin/auth') {
        return await this.handleGetAdminUser(event);
      } else {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Endpoint not found',
            availableEndpoints: [
              'POST /admin/auth - validate admin token',
              'GET /admin/auth - get admin user context',
              'GET /admin/auth/health - health check'
            ]
          })
        };
      }
    } catch (error: any) {
      console.error('❌ Auth handler error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Authentication service error',
          message: error.message
        })
      };
    }
  }

  /**
   * Handle admin user context retrieval
   */
  async handleGetAdminUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const token = this.extractTokenFromHeaders(event.headers);

    if (!token) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Authorization required',
          message: 'Please provide a JWT token in Authorization header'
        })
      };
    }

    const authResult = await this.validateAdminToken(token);
    
    return {
      statusCode: authResult.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        isAuthenticated: authResult.isAuthorized,
        userContext: authResult.userContext,
        error: authResult.error
      })
    };
  }

  /**
   * Validate admin JWT token
   */
  async validateAdminToken(token: string): Promise<AuthResponse> {
    try {
      console.log('🔍 Validating admin JWT token');
      
      // Decode token header to get kid
      const decodedHeader = decode(token, { complete: true });
      if (!decodedHeader || typeof decodedHeader === 'string' || !decodedHeader.header.kid) {
        throw new Error('Invalid token format');
      }

      // Get signing key
      const key = await this.jwksClient.getSigningKey(decodedHeader.header.kid);
      const signingKey = key.getPublicKey();

      // Verify token
      const payload = verify(token, signingKey, {
        algorithms: ['RS256'],
        audience: process.env.USER_POOL_CLIENT_ID,
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`
      }) as CognitoJWTPayload;

      console.log('✅ Token verified successfully');

      // Ensure this is an admin user
      const userType = payload['custom:user_type'];
      if (userType !== 'admin') {
        throw new Error('Access denied: Admin privileges required');
      }

      // Extract admin user context
      const userContext = this.extractAdminUserContext(payload);
      
      return {
        isAuthorized: true,
        userContext,
        statusCode: 200
      };

    } catch (error: any) {
      console.error('❌ Admin token validation failed:', error);
      return {
        isAuthorized: false,
        error: error.message,
        statusCode: 401
      };
    }
  }

  /**
   * Extract admin user context from JWT payload
   */
  private extractAdminUserContext(payload: CognitoJWTPayload): AdminUserContext {
    return {
      userId: payload.sub,
      username: payload['cognito:username'],
      email: payload.email,
      userType: 'admin',
      isVerified: payload.email_verified,
      languagePreference: (payload['custom:language_preference'] || 'en') as 'en' | 'es',
      permissions: [
        'admin:dashboard',
        'admin:analytics',
        'admin:users',
        'admin:system',
        'chat:monitor',
        'chat:moderate'
      ]
    };
  }

  /**
   * Handle token validation endpoint
   */
  async handleTokenValidation(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const body = JSON.parse(event.body || '{}');
    const token = body.token || this.extractTokenFromHeaders(event.headers);

    if (!token) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Token required',
          message: 'Please provide a JWT token'
        })
      };
    }

    const authResult = await this.validateAdminToken(token);
    
    return {
      statusCode: authResult.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        isValid: authResult.isAuthorized,
        userContext: authResult.userContext,
        error: authResult.error
      })
    };
  }

  /**
   * Handle health check
   */
  handleHealthCheck(): APIGatewayProxyResult {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'healthy',
        service: 'ada-clara-simple-auth-handler',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        userModel: 'simplified',
        supportedUserTypes: ['public', 'admin'],
        authRequired: {
          chat: false,
          admin: true
        }
      })
    };
  }

  /**
   * Extract token from headers
   */
  private extractTokenFromHeaders(headers: { [key: string]: string | undefined }): string | null {
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
    
    return authHeader; // Assume it's just the token
  }
}

/**
 * Lambda handler
 */
export const handler: Handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const authHandler = new SimplifiedAuthHandler();
  return await authHandler.handleAuth(event);
};