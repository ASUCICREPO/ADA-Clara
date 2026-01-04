'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, initializeAuth } from '@/lib/api/auth.service';

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

/**
 * Protected Admin Route Component
 * Redirects to login if user is not authenticated
 */
export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Initialize auth if not already initialized
        initializeAuth();
        
        // Check if user is authenticated
        const authenticated = await isAuthenticated();
        
        if (!authenticated) {
          // Redirect to login page
          router.push('/admin/login');
        } else {
          setIsAuthorized(true);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/admin/login');
      }
    };

    checkAuth();
  }, [router]);

  // Show loading state while checking authentication
  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#a6192e]"></div>
          <p className="mt-4 text-[#64748b]">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Only render children if authorized
  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}

