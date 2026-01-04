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
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: config.cognito.userPoolId,
          userPoolClientId: config.cognito.clientId,
          ...(config.cognito.identityPoolId ? { identityPoolId: config.cognito.identityPoolId } : {}),
          loginWith: {
            email: true,
          },
          signUpVerificationMethod: 'code',
          userAttributes: {
            email: {
              required: true,
            },
          },
        },
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
    
    const session = await fetchAuthSession();
    
    // In Amplify v6, tokens are in tokens.idToken
    const idToken = session.tokens?.idToken?.toString();
    
    if (!idToken) {
      return null;
    }
    
    return idToken;
  } catch (error) {
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

  try {
    // Amplify v6 signIn throws on error, returns void on success
    await amplifySignIn({
      username: email,
      password: password,
    });

    // Get user details after successful sign in
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Failed to get user details after sign in');
    }

    return user;
  } catch (error) {
    console.error('Sign in error:', error);
    
    // Provide user-friendly error messages
    if (error instanceof Error) {
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Incorrect email or password.');
      } else if (error.name === 'UserNotConfirmedException') {
        throw new Error('User account is not confirmed. Please check your email.');
      } else if (error.name === 'UserNotFoundException') {
        throw new Error('User not found. Please check your email.');
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

