/**
 * Auth Handler Lambda for ADA Clara
 * 
 * Handles JWT token validation, user context extraction, and role-based access control
 * Integrates with Cognito User Pool and Identity Pool for authentication
 */

import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { verify, decode } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

interface CognitoJWTPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  'cognito:username': string;
  'cognito:groups'?: string[];
  'custom:user_type'?: string;
  'custom:membership_id'?: string;
  'custom:organization'?: string;
  'custom:language_preference'?: string;
  'custom:verified_pro'?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  token_use: string;
}

interface UserContext {
  userId: string;
  username: string;
  email: string;
  userType: 'public' | 'professional' | 'admin';
  isVerified: boolean;
  membershipId?: string;
  organization?: string;
  languagePreference: 'en' | 'es';
  permissions: string[];
  sessionId?: string;
}

interface AuthResponse {
  isAuthorized: boolean;
  userContext?: UserContext;
  error?: string;
  statusCode: number;
}

class AuthHandler {
  private cognitoClient: CognitoIdentityProviderClient;
  private dynamoClient: DynamoDBDocumentClient;
  private jwksClient: JwksClient;
  private userPoolId: string;
  private region: string;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION || 'us-east-1' });
    const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoDbClient);
    
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
  async handleAuth(event: APIGatewayProxyEvent | APIGatewayAuthorizerEvent): Promise<APIGatewayProxyResult | APIGatewayAuthorizerResult> {
    console.log('🔐 Auth Handler started');
    console.log('Event type:', ('type' in event) ? event.type : 'API Gateway Proxy');

    try {
      // Handle different event types
      if ('type' in event && event.type === 'REQUEST') {
        // API Gateway Authorizer
        return await this.handleAuthorizer(event as APIGatewayAuthorizerEvent);
      } else {
        // Direct API call
        return await this.handleDirectAuth(event as APIGatewayProxyEvent);
      }
    } catch (error: any) {
      console.error('❌ Auth handler error:', error);
      
      if ('type' in event && event.type === 'REQUEST') {
        return this.generateAuthorizerResponse('Deny', event.methodArn, {});
      } else {
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
  }

  /**
   * Handle API Gateway Authorizer requests
   */
  async handleAuthorizer(event: APIGatewayAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
    console.log('🔍 Processing authorizer request');
    
    try {
      // Check if this is a token-based authorizer
      const token = ('authorizationToken' in event) 
        ? this.extractToken(event.authorizationToken)
        : this.extractTokenFromHeaders(event.headers || {});
        
      if (!token) {
        console.log('❌ No token provided');
        return this.generateAuthorizerResponse('Deny', event.methodArn, {});
      }

      const authResult = await this.validateToken(token);
      if (!authResult.isAuthorized || !authResult.userContext) {
        console.log('❌ Token validation failed');
        return this.generateAuthorizerResponse('Deny', event.methodArn, {});
      }

      console.log('✅ Token validated successfully');
      return this.generateAuthorizerResponse('Allow', event.methodArn, authResult.userContext);

    } catch (error: any) {
      console.error('❌ Authorizer error:', error);
      return this.generateAuthorizerResponse('Deny', event.methodArn, {});
    }
  }

  /**
   * Handle direct authentication API calls
   */
  async handleDirectAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('🔍 Processing direct auth request');
    
    const path = event.path;
    const method = event.httpMethod;

    try {
      if (method === 'POST' && path === '/auth') {
        return await this.handleTokenValidation(event);
      } else if (method === 'GET' && path === '/auth') {
        return await this.handleGetUser(event);
      } else if (method === 'GET' && path === '/auth/user') {
        return await this.handleGetUser(event);
      } else if (method === 'POST' && path === '/auth/verify-professional') {
        return await this.handleProfessionalVerification(event);
      } else if (method === 'GET' && path === '/auth/health') {
        return this.handleHealthCheck();
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
              'POST /auth - validate token',
              'GET /auth - get user context',
              'GET /auth/user - get user context',
              'POST /auth/verify-professional - verify professional credentials',
              'GET /auth/health - health check'
            ]
          })
        };
      }
    } catch (error: any) {
      console.error('❌ Direct auth error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Authentication error',
          message: error.message
        })
      };
    }
  }

  /**
   * Handle get user context
   */
  async handleGetUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

    const authResult = await this.validateToken(token);
    
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
   * Validate JWT token
   */
  async validateToken(token: string): Promise<AuthResponse> {
    try {
      console.log('🔍 Validating JWT token');
      
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

      // Extract user context
      const userContext = await this.extractUserContext(payload);
      
      return {
        isAuthorized: true,
        userContext,
        statusCode: 200
      };

    } catch (error: any) {
      console.error('❌ Token validation failed:', error);
      return {
        isAuthorized: false,
        error: error.message,
        statusCode: 401
      };
    }
  }

  /**
   * Extract user context from JWT payload
   */
  async extractUserContext(payload: CognitoJWTPayload): Promise<UserContext> {
    const userType = (payload['custom:user_type'] || 'public') as 'public' | 'professional' | 'admin';
    const isVerified = payload.email_verified && (payload['custom:verified_pro'] === 'true' || userType === 'admin');
    
    // Get additional user data from DynamoDB if professional
    let membershipData = null;
    if (userType === 'professional' && payload['custom:membership_id']) {
      membershipData = await this.getProfessionalMembershipData(payload['custom:membership_id']);
    }

    const permissions = this.getUserPermissions(userType, isVerified);

    return {
      userId: payload.sub,
      username: payload['cognito:username'],
      email: payload.email,
      userType,
      isVerified,
      membershipId: payload['custom:membership_id'],
      organization: payload['custom:organization'] || membershipData?.organization,
      languagePreference: (payload['custom:language_preference'] || 'en') as 'en' | 'es',
      permissions
    };
  }

  /**
   * Get user permissions based on user type
   */
  private getUserPermissions(userType: string, isVerified: boolean): string[] {
    const basePermissions = ['chat:basic', 'chat:history'];
    
    switch (userType) {
      case 'admin':
        return [
          ...basePermissions,
          'admin:dashboard',
          'admin:analytics',
          'admin:users',
          'admin:system',
          'professional:enhanced',
          'chat:priority'
        ];
      
      case 'professional':
        const professionalPermissions = [
          ...basePermissions,
          'professional:resources',
          'chat:enhanced'
        ];
        
        if (isVerified) {
          professionalPermissions.push(
            'professional:verified',
            'professional:clinical',
            'chat:priority'
          );
        }
        
        return professionalPermissions;
      
      case 'public':
      default:
        return basePermissions;
    }
  }

  /**
   * Get professional membership data from DynamoDB
   */
  async getProfessionalMembershipData(membershipId: string): Promise<any> {
    try {
      const command = new GetCommand({
        TableName: process.env.PROFESSIONAL_MEMBERS_TABLE!,
        Key: { membershipId }
      });

      const result = await this.dynamoClient.send(command);
      return result.Item;
    } catch (error: any) {
      console.error('❌ Failed to get membership data:', error);
      return null;
    }
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

    const authResult = await this.validateToken(token);
    
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
   * Handle professional verification
   */
  async handleProfessionalVerification(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const body = JSON.parse(event.body || '{}');
    const { membershipId, organization, credentials } = body;

    if (!membershipId || !organization) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing required fields',
          message: 'membershipId and organization are required'
        })
      };
    }

    try {
      // Verify professional credentials (simplified implementation)
      const isValid = await this.verifyProfessionalCredentials(membershipId, organization, credentials);
      
      if (isValid) {
        // Update user attributes in Cognito
        const token = this.extractTokenFromHeaders(event.headers);
        if (token) {
          const authResult = await this.validateToken(token);
          if (authResult.isAuthorized && authResult.userContext) {
            await this.updateUserProfessionalStatus(authResult.userContext.username, membershipId, organization);
          }
        }

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            verified: true,
            message: 'Professional credentials verified successfully'
          })
        };
      } else {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            verified: false,
            message: 'Professional credentials could not be verified'
          })
        };
      }
    } catch (error: any) {
      console.error('❌ Professional verification error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Verification service error',
          message: error.message
        })
      };
    }
  }

  /**
   * Verify professional credentials (simplified implementation)
   */
  async verifyProfessionalCredentials(membershipId: string, organization: string, credentials: any): Promise<boolean> {
    // In a real implementation, this would integrate with professional licensing databases
    // For now, we'll do basic validation
    
    // Check if membership exists in our database
    const existingMembership = await this.getProfessionalMembershipData(membershipId);
    if (existingMembership) {
      return existingMembership.organization === organization && existingMembership.status === 'active';
    }

    // Basic validation rules
    const isValidFormat = /^[A-Z]{2,4}\d{6,10}$/.test(membershipId); // Example format
    const isValidOrganization = organization.length > 3;
    
    if (isValidFormat && isValidOrganization) {
      // Store new professional membership
      await this.storeProfessionalMembership(membershipId, organization, credentials);
      return true;
    }

    return false;
  }

  /**
   * Store professional membership data
   */
  async storeProfessionalMembership(membershipId: string, organization: string, credentials: any): Promise<void> {
    const command = new PutCommand({
      TableName: process.env.PROFESSIONAL_MEMBERS_TABLE!,
      Item: {
        membershipId,
        organization,
        status: 'active',
        verifiedAt: new Date().toISOString(),
        credentials: {
          type: credentials?.type || 'manual',
          verificationMethod: 'self-reported' // In production, this would be more sophisticated
        }
      }
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Update user professional status in Cognito
   */
  async updateUserProfessionalStatus(username: string, membershipId: string, organization: string): Promise<void> {
    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: this.userPoolId,
      Username: username,
      UserAttributes: [
        {
          Name: 'custom:user_type',
          Value: 'professional'
        },
        {
          Name: 'custom:membership_id',
          Value: membershipId
        },
        {
          Name: 'custom:organization',
          Value: organization
        },
        {
          Name: 'custom:verified_pro',
          Value: 'true'
        }
      ]
    });

    await this.cognitoClient.send(command);
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
        service: 'ada-clara-auth-handler',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      })
    };
  }

  /**
   * Extract token from Authorization header
   */
  private extractToken(authorizationToken: string): string | null {
    if (!authorizationToken) return null;
    
    const parts = authorizationToken.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
    
    return authorizationToken; // Assume it's just the token
  }

  /**
   * Extract token from headers
   */
  private extractTokenFromHeaders(headers: { [key: string]: string | undefined }): string | null {
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    
    return this.extractToken(authHeader);
  }

  /**
   * Generate API Gateway Authorizer response
   */
  private generateAuthorizerResponse(effect: 'Allow' | 'Deny', resource: string, context: any): APIGatewayAuthorizerResult {
    return {
      principalId: context.userId || 'anonymous',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: effect,
            Resource: resource
          }
        ]
      },
      context: {
        userId: context.userId || '',
        userType: context.userType || 'public',
        permissions: JSON.stringify(context.permissions || []),
        isVerified: String(context.isVerified || false)
      }
    };
  }
}

/**
 * Lambda handler
 */
export const handler: Handler = async (event: APIGatewayProxyEvent | APIGatewayAuthorizerEvent): Promise<APIGatewayProxyResult | APIGatewayAuthorizerResult> => {
  const authHandler = new AuthHandler();
  return await authHandler.handleAuth(event);
};