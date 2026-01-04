/**
 * Authentication Service
 * Handles Cognito authentication for admin users using AWS Amplify v6
 */

import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn as amplifySignIn, signOut as amplifySignOut, getCurrentUser as amplifyGetCurrentUser } from 'aws-amplify/auth';
import { getConfig } from './config';

export interface AuthUser {
  username: string;
  email?: string;
  attributes?: Record<string, string>;
}

let isInitialized = false;

/**
 * Initialize Amplify Auth with configuration
 * This should be called once at app startup
 */
export function initializeAuth(): void {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;
  
  const config = getConfig();
  
  // Validate Cognito configuration
  if (!config.cognito.userPoolId || !config.cognito.clientId) {
    console.warn('Cognito configuration is incomplete. Admin authentication will not work.');
    return;
  }

  try {
    // Build Cognito config - only include identityPoolId if it's provided
    const cognitoConfig: any = {
      userPoolId: config.cognito.userPoolId,
      userPoolClientId: config.cognito.clientId,
      loginWith: {
        email: true,
      },
      signUpVerificationMethod: 'code',
      userAttributes: {
        email: {
          required: true,
        },
      },
    };

    // Only add identityPoolId if it's provided (it's optional)
    // Note: Identity Pool is optional for basic authentication
    // It's only needed if you want to use AWS services with temporary credentials
    if (config.cognito.identityPoolId && config.cognito.identityPoolId.trim() !== '') {
      cognitoConfig.identityPoolId = config.cognito.identityPoolId;
    }

    Amplify.configure({
      Auth: {
        Cognito: cognitoConfig,
      },
    });

    isInitialized = true;
    console.log('Amplify Auth initialized successfully');
  } catch (error) {
    console.error('Error initializing Amplify Auth:', error);
    throw error;
  }
}

/**
 * Get current authentication token (ID token)
 */
export async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    if (!isInitialized) {
      initializeAuth();
    }
    
    // Try to fetch session, but don't fail if Identity Pool has issues
    // We only need the ID token from User Pool, not Identity Pool credentials
    const session = await fetchAuthSession({ forceRefresh: false });
    
    // In Amplify v6, tokens are in tokens.idToken
    const idToken = session.tokens?.idToken?.toString();
    
    if (!idToken) {
      return null;
    }
    
    return idToken;
  } catch (error: any) {
    // If it's an Identity Pool error, we can still get the ID token
    if (error?.name === 'InvalidIdentityPoolConfigurationException' || 
        error?.message?.includes('identity pool')) {
      console.warn('Identity Pool configuration issue, but User Pool authentication may still work:', error);
      // Try to get token directly from User Pool session
      try {
        const session = await fetchAuthSession({ forceRefresh: false });
        const idToken = session.tokens?.idToken?.toString();
        return idToken || null;
      } catch (innerError) {
        console.error('Error getting auth token after Identity Pool error:', innerError);
        return null;
      }
    }
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
  const token = await getAuthToken();
    return token !== null && token.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Sign in user with email and password
 */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (typeof window === 'undefined') {
    throw new Error('Sign in can only be called in the browser');
  }

  if (!isInitialized) {
    initializeAuth();
  }

  // Check if user is already signed in - sign them out first
  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      console.log('User already signed in, signing out first...');
      await signOut();
      // Wait a bit for sign out to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    // User is not signed in, continue
    console.log('No existing session found, proceeding with sign in');
  }

  try {
    // Amplify v6 signIn may return a challenge if password change is required
    const signInResult = await amplifySignIn({
      username: email,
      password: password,
    });

    // Check if sign-in requires a challenge (e.g., NEW_PASSWORD_REQUIRED for "Force change password" status)
    if (signInResult && signInResult.isSignedIn === false && signInResult.nextStep) {
      const { signInStep } = signInResult.nextStep;
      
      // In Amplify v6, check for new password challenge
      // The signInStep might be a string that contains "NEW_PASSWORD" or we check the challenge name
      if (signInStep && (signInStep.toString().includes('NEW_PASSWORD') || 
          signInStep.toString().includes('PASSWORD'))) {
        // User needs to change password - this happens when user is in "Force change password" status
        throw new Error('NEW_PASSWORD_REQUIRED: You must change your password before signing in. Please contact your administrator to set a permanent password, or use the AWS Cognito console to change your password.');
      }
    }

    // Wait a bit for the session to be established
    // Then fetch the session to ensure tokens are available
    await fetchAuthSession({ forceRefresh: true });

    // Get user details after successful sign in
    // Retry logic in case the session isn't immediately available
    let user: AuthUser | null = null;
    let retries = 3;
    while (!user && retries > 0) {
      try {
        user = await getCurrentUser();
        if (!user) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100));
          retries--;
        }
      } catch (err) {
        console.warn('getCurrentUser attempt failed, retrying...', err);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries--;
      }
    }

    if (!user) {
      // If we still can't get the user, try to construct from session
      const session = await fetchAuthSession();
      const idTokenPayload = session.tokens?.idToken?.payload;
      if (idTokenPayload) {
        return {
          username: email,
          email: (idTokenPayload.email as string) || email,
          attributes: {
            email: (idTokenPayload.email as string) || email,
            ...(idTokenPayload as Record<string, string>),
          },
        };
      }
      throw new Error('Failed to get user details after sign in. Please try again.');
    }

    return user;
  } catch (error) {
    console.error('Sign in error:', error);
    
    // Provide user-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes('NEW_PASSWORD_REQUIRED')) {
        throw error; // Re-throw the NEW_PASSWORD_REQUIRED error as-is
      } else if (error.name === 'NotAuthorizedException') {
        throw new Error('Incorrect email or password.');
      } else if (error.name === 'UserNotConfirmedException') {
        throw new Error('User account is not confirmed. Please check your email.');
      } else if (error.name === 'UserNotFoundException') {
        throw new Error('User not found. Please check your email.');
      }
      // Don't re-throw the "Failed to get user details" error as-is, wrap it
      if (error.message.includes('Failed to get user details')) {
        throw error;
      }
      throw error;
    }
    
    throw new Error('Failed to sign in. Please try again.');
  }
}

/**
 * Sign out user
 */
export async function signOut(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  if (!isInitialized) {
    return;
  }

  try {
    await amplifySignOut();
  } catch (error) {
    console.error('Sign out error:', error);
    // Even if sign out fails, we should clear local state
    throw error;
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (typeof window === 'undefined') return null;

  if (!isInitialized) {
    initializeAuth();
  }

  try {
    const user = await amplifyGetCurrentUser();
    
    // Get user attributes from the session
    const session = await fetchAuthSession();
    const idTokenPayload = session.tokens?.idToken?.payload;
    
    return {
      username: user.username,
      email: user.signInDetails?.loginId || (idTokenPayload?.email as string) || undefined,
      attributes: {
        email: (idTokenPayload?.email as string) || '',
        ...(idTokenPayload as Record<string, string>),
      },
    };
  } catch (error) {
    // User is not authenticated
  return null;
  }
}

