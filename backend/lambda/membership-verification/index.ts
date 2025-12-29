/**
 * Membership Verification Lambda for ADA Clara
 * 
 * Handles professional membership verification and management
 * Integrates with healthcare professional databases and licensing systems
 */

import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

interface MembershipVerificationRequest {
  membershipId: string;
  organization: string;
  licenseNumber?: string;
  profession: string;
  state?: string;
  country?: string;
  credentials?: {
    degree?: string;
    certifications?: string[];
    yearsOfExperience?: number;
  };
  contactInfo?: {
    phone?: string;
    workEmail?: string;
  };
}

interface MembershipRecord {
  membershipId: string;
  organization: string;
  profession: string;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  verificationMethod: 'manual' | 'automated' | 'third-party';
  verifiedAt?: string;
  expiresAt?: string;
  credentials: any;
  contactInfo: any;
  verificationHistory: VerificationAttempt[];
  createdAt: string;
  updatedAt: string;
}

interface VerificationAttempt {
  timestamp: string;
  method: string;
  result: 'success' | 'failure' | 'pending';
  details: any;
}

interface VerificationResult {
  isValid: boolean;
  membershipId: string;
  status: string;
  organization: string;
  profession: string;
  verificationMethod: string;
  expiresAt?: string;
  message: string;
  nextSteps?: string[];
}

class MembershipVerificationService {
  private cognitoClient: CognitoIdentityProviderClient;
  private dynamoClient: DynamoDBDocumentClient;
  private userPoolId: string;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION || 'us-east-1' });
    const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION || 'us-east-1' });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoDbClient);
    this.userPoolId = process.env.USER_POOL_ID!;
  }

  /**
   * Main handler for membership verification requests
   */
  async handleVerification(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log('🏥 Membership Verification Service started');
    console.log('Path:', event.path);
    console.log('Method:', event.httpMethod);

    try {
      const path = event.path;
      const method = event.httpMethod;

      if (method === 'POST' && path === '/membership/verify') {
        return await this.verifyMembership(event);
      } else if (method === 'GET' && path === '/membership/status') {
        return await this.getMembershipStatus(event);
      } else if (method === 'POST' && path === '/membership/update') {
        return await this.updateMembership(event);
      } else if (method === 'GET' && path === '/membership/organizations') {
        return await this.getSupportedOrganizations();
      } else if (method === 'GET' && path === '/membership/health') {
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
              'POST /membership/verify',
              'GET /membership/status',
              'POST /membership/update',
              'GET /membership/organizations',
              'GET /membership/health'
            ]
          })
        };
      }
    } catch (error: any) {
      console.error('❌ Membership verification error:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Membership verification service error',
          message: error.message
        })
      };
    }
  }

  /**
   * Verify professional membership
   */
  async verifyMembership(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const body = JSON.parse(event.body || '{}');
    const request: MembershipVerificationRequest = body;

    // Validate required fields
    if (!request.membershipId || !request.organization || !request.profession) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing required fields',
          message: 'membershipId, organization, and profession are required',
          requiredFields: ['membershipId', 'organization', 'profession']
        })
      };
    }

    try {
      console.log(`🔍 Verifying membership: ${request.membershipId} for ${request.organization}`);

      // Check if membership already exists
      const existingMembership = await this.getMembershipRecord(request.membershipId);
      if (existingMembership && existingMembership.status === 'verified') {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            isValid: true,
            membershipId: request.membershipId,
            status: 'verified',
            organization: existingMembership.organization,
            profession: existingMembership.profession,
            verificationMethod: existingMembership.verificationMethod,
            expiresAt: existingMembership.expiresAt,
            message: 'Membership already verified'
          })
        };
      }

      // Perform verification
      const verificationResult = await this.performVerification(request);

      // Store/update membership record
      await this.storeMembershipRecord(request, verificationResult);

      // Update Cognito user attributes if verified
      if (verificationResult.isValid) {
        const userId = this.extractUserIdFromEvent(event);
        if (userId) {
          await this.updateCognitoUserAttributes(userId, request, verificationResult);
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(verificationResult)
      };

    } catch (error: any) {
      console.error('❌ Membership verification failed:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Verification failed',
          message: error.message
        })
      };
    }
  }

  /**
   * Perform membership verification using multiple methods
   */
  async performVerification(request: MembershipVerificationRequest): Promise<VerificationResult> {
    console.log(`🔍 Performing verification for ${request.membershipId}`);

    // Try different verification methods in order of preference
    const verificationMethods = [
      () => this.verifyWithThirdPartyAPI(request),
      () => this.verifyWithOrganizationDatabase(request),
      () => this.verifyWithManualProcess(request)
    ];

    for (const method of verificationMethods) {
      try {
        const result = await method();
        if (result.isValid) {
          console.log(`✅ Verification successful using ${result.verificationMethod}`);
          return result;
        }
      } catch (error: any) {
        console.warn(`⚠️ Verification method failed:`, error.message);
        continue;
      }
    }

    // All methods failed
    return {
      isValid: false,
      membershipId: request.membershipId,
      status: 'rejected',
      organization: request.organization,
      profession: request.profession,
      verificationMethod: 'failed',
      message: 'Unable to verify membership with provided information',
      nextSteps: [
        'Verify membership ID format',
        'Contact your organization for correct membership information',
        'Try again with additional credentials'
      ]
    };
  }

  /**
   * Verify with third-party API (placeholder for real integrations)
   */
  async verifyWithThirdPartyAPI(request: MembershipVerificationRequest): Promise<VerificationResult> {
    console.log('🌐 Attempting third-party API verification');

    // In a real implementation, this would integrate with:
    // - National Provider Identifier (NPI) Registry
    // - State medical licensing boards
    // - Professional organization APIs
    // - Healthcare credentialing services

    // For now, simulate API verification based on organization
    const supportedOrganizations = [
      'American Diabetes Association',
      'American Medical Association',
      'American Nurses Association',
      'Academy of Nutrition and Dietetics',
      'American Association of Diabetes Educators'
    ];

    if (!supportedOrganizations.includes(request.organization)) {
      throw new Error('Organization not supported for automated verification');
    }

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Basic validation rules for demo
    const isValidFormat = this.validateMembershipFormat(request.membershipId, request.organization);
    const hasRequiredCredentials = request.credentials && Object.keys(request.credentials).length > 0;

    if (isValidFormat && hasRequiredCredentials) {
      return {
        isValid: true,
        membershipId: request.membershipId,
        status: 'verified',
        organization: request.organization,
        profession: request.profession,
        verificationMethod: 'third-party',
        expiresAt: this.calculateExpirationDate(),
        message: 'Membership verified through third-party API'
      };
    }

    throw new Error('Third-party verification failed');
  }

  /**
   * Verify with organization database (placeholder)
   */
  async verifyWithOrganizationDatabase(request: MembershipVerificationRequest): Promise<VerificationResult> {
    console.log('🏢 Attempting organization database verification');

    // In a real implementation, this would query organization-specific databases
    // For now, use basic validation rules

    const isValidProfession = this.validateProfession(request.profession);
    const hasContactInfo = request.contactInfo && (request.contactInfo.phone || request.contactInfo.workEmail);

    if (isValidProfession && hasContactInfo) {
      return {
        isValid: true,
        membershipId: request.membershipId,
        status: 'verified',
        organization: request.organization,
        profession: request.profession,
        verificationMethod: 'automated',
        expiresAt: this.calculateExpirationDate(),
        message: 'Membership verified through organization database'
      };
    }

    throw new Error('Organization database verification failed');
  }

  /**
   * Manual verification process (fallback)
   */
  async verifyWithManualProcess(request: MembershipVerificationRequest): Promise<VerificationResult> {
    console.log('👤 Using manual verification process');

    // For manual verification, we accept the membership but mark it as pending
    // In a real system, this would trigger a manual review process

    return {
      isValid: false, // Not immediately valid, requires manual review
      membershipId: request.membershipId,
      status: 'pending',
      organization: request.organization,
      profession: request.profession,
      verificationMethod: 'manual',
      message: 'Membership submitted for manual verification',
      nextSteps: [
        'Your membership is under review',
        'You will receive an email within 2-3 business days',
        'You can check status using the membership status endpoint'
      ]
    };
  }

  /**
   * Validate membership ID format based on organization
   */
  private validateMembershipFormat(membershipId: string, organization: string): boolean {
    // Organization-specific format validation
    const formatRules: { [key: string]: RegExp } = {
      'American Diabetes Association': /^ADA\d{6,8}$/,
      'American Medical Association': /^AMA\d{8,10}$/,
      'American Nurses Association': /^ANA[A-Z]{2}\d{6}$/,
      'Academy of Nutrition and Dietetics': /^AND\d{7}$/,
      'American Association of Diabetes Educators': /^AADE\d{5,7}$/
    };

    const rule = formatRules[organization];
    if (rule) {
      return rule.test(membershipId);
    }

    // Generic format validation
    return /^[A-Z]{2,6}\d{5,10}$/.test(membershipId);
  }

  /**
   * Validate profession
   */
  private validateProfession(profession: string): boolean {
    const validProfessions = [
      'Physician',
      'Nurse Practitioner',
      'Registered Nurse',
      'Certified Diabetes Educator',
      'Registered Dietitian',
      'Pharmacist',
      'Endocrinologist',
      'Primary Care Physician',
      'Diabetes Specialist',
      'Nutritionist'
    ];

    return validProfessions.includes(profession);
  }

  /**
   * Calculate membership expiration date
   */
  private calculateExpirationDate(): string {
    const now = new Date();
    const expirationDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    return expirationDate.toISOString();
  }

  /**
   * Get membership record from DynamoDB
   */
  async getMembershipRecord(membershipId: string): Promise<MembershipRecord | null> {
    try {
      const command = new GetCommand({
        TableName: process.env.PROFESSIONAL_MEMBERS_TABLE!,
        Key: { membershipId }
      });

      const result = await this.dynamoClient.send(command);
      return result.Item as MembershipRecord || null;
    } catch (error: any) {
      console.error('❌ Failed to get membership record:', error);
      return null;
    }
  }

  /**
   * Store membership record in DynamoDB
   */
  async storeMembershipRecord(request: MembershipVerificationRequest, result: VerificationResult): Promise<void> {
    const now = new Date().toISOString();
    
    const membershipRecord: MembershipRecord = {
      membershipId: request.membershipId,
      organization: request.organization,
      profession: request.profession,
      status: result.status as any,
      verificationMethod: result.verificationMethod,
      verifiedAt: result.isValid ? now : undefined,
      expiresAt: result.expiresAt,
      credentials: request.credentials || {},
      contactInfo: request.contactInfo || {},
      verificationHistory: [{
        timestamp: now,
        method: result.verificationMethod,
        result: result.isValid ? 'success' : 'failure',
        details: { message: result.message }
      }],
      createdAt: now,
      updatedAt: now
    };

    const command = new PutCommand({
      TableName: process.env.PROFESSIONAL_MEMBERS_TABLE!,
      Item: membershipRecord
    });

    await this.dynamoClient.send(command);
    console.log(`✅ Stored membership record for ${request.membershipId}`);
  }

  /**
   * Update Cognito user attributes
   */
  async updateCognitoUserAttributes(userId: string, request: MembershipVerificationRequest, result: VerificationResult): Promise<void> {
    try {
      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: userId,
        UserAttributes: [
          {
            Name: 'custom:user_type',
            Value: 'professional'
          },
          {
            Name: 'custom:membership_id',
            Value: request.membershipId
          },
          {
            Name: 'custom:organization',
            Value: request.organization
          },
          {
            Name: 'custom:verified_professional',
            Value: result.isValid ? 'true' : 'pending'
          }
        ]
      });

      await this.cognitoClient.send(command);
      console.log(`✅ Updated Cognito attributes for user ${userId}`);
    } catch (error: any) {
      console.error('❌ Failed to update Cognito attributes:', error);
      // Don't throw error - membership record is still valid
    }
  }

  /**
   * Get membership status
   */
  async getMembershipStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const membershipId = event.queryStringParameters?.membershipId;
    
    if (!membershipId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing membershipId parameter'
        })
      };
    }

    try {
      const membershipRecord = await this.getMembershipRecord(membershipId);
      
      if (!membershipRecord) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Membership not found',
            membershipId
          })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          membershipId: membershipRecord.membershipId,
          organization: membershipRecord.organization,
          profession: membershipRecord.profession,
          status: membershipRecord.status,
          verificationMethod: membershipRecord.verificationMethod,
          verifiedAt: membershipRecord.verifiedAt,
          expiresAt: membershipRecord.expiresAt,
          lastUpdated: membershipRecord.updatedAt
        })
      };
    } catch (error: any) {
      console.error('❌ Failed to get membership status:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Failed to retrieve membership status',
          message: error.message
        })
      };
    }
  }

  /**
   * Get supported organizations
   */
  async getSupportedOrganizations(): Promise<APIGatewayProxyResult> {
    const organizations = [
      {
        name: 'American Diabetes Association',
        code: 'ADA',
        membershipIdFormat: 'ADA followed by 6-8 digits',
        verificationMethods: ['third-party', 'automated'],
        professions: ['Physician', 'Nurse', 'Certified Diabetes Educator', 'Registered Dietitian']
      },
      {
        name: 'American Medical Association',
        code: 'AMA',
        membershipIdFormat: 'AMA followed by 8-10 digits',
        verificationMethods: ['third-party', 'automated'],
        professions: ['Physician', 'Primary Care Physician', 'Endocrinologist']
      },
      {
        name: 'American Nurses Association',
        code: 'ANA',
        membershipIdFormat: 'ANA followed by state code and 6 digits',
        verificationMethods: ['automated', 'manual'],
        professions: ['Registered Nurse', 'Nurse Practitioner']
      },
      {
        name: 'Academy of Nutrition and Dietetics',
        code: 'AND',
        membershipIdFormat: 'AND followed by 7 digits',
        verificationMethods: ['third-party', 'automated'],
        professions: ['Registered Dietitian', 'Nutritionist']
      },
      {
        name: 'American Association of Diabetes Educators',
        code: 'AADE',
        membershipIdFormat: 'AADE followed by 5-7 digits',
        verificationMethods: ['third-party', 'automated'],
        professions: ['Certified Diabetes Educator', 'Diabetes Specialist']
      }
    ];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        organizations,
        totalCount: organizations.length,
        verificationMethods: ['third-party', 'automated', 'manual'],
        supportedProfessions: [
          'Physician',
          'Nurse Practitioner',
          'Registered Nurse',
          'Certified Diabetes Educator',
          'Registered Dietitian',
          'Pharmacist',
          'Endocrinologist',
          'Primary Care Physician',
          'Diabetes Specialist',
          'Nutritionist'
        ]
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
        service: 'ada-clara-membership-verification',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      })
    };
  }

  /**
   * Extract user ID from event (simplified)
   */
  private extractUserIdFromEvent(event: APIGatewayProxyEvent): string | null {
    // In a real implementation, this would extract from JWT token or request context
    return event.requestContext?.authorizer?.userId || null;
  }
}

/**
 * Lambda handler
 */
export const handler: Handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const service = new MembershipVerificationService();
  return await service.handleVerification(event);
};