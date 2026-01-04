'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, isAuthenticated, initializeAuth } from '@/lib/api/auth.service';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Initialize auth and check if already authenticated
    const checkAuth = async () => {
      try {
        initializeAuth();
        const authenticated = await isAuthenticated();
        if (authenticated) {
          router.push('/admin');
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      // Redirect to admin dashboard on success
      router.push('/admin');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to sign in. Please try again.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#a6192e]"></div>
          <p className="mt-4 text-[#64748b]">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center" style={{ padding: '24px' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[16px] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#a6192e]/10 rounded-[12px] mb-4">
              <img 
                src="/logo.png" 
                alt="ADA Clara Logo" 
                className="w-12 h-12 object-contain"
              />
            </div>
            <h1 className="text-2xl font-semibold text-[#020617] mb-2">Admin Login</h1>
            <p className="text-sm text-[#64748b]">Sign in to access the admin dashboard</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[10px]">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#020617] mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-[#cbd5e1] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 focus:border-[#a6192e] text-[#020617]"
                placeholder="admin@example.com"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#020617] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-[#cbd5e1] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 focus:border-[#a6192e] text-[#020617]"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#a6192e] text-white py-3 px-4 rounded-[10px] font-medium hover:bg-[#8b1425] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#94a3b8] mt-6">
          ADA Clara Admin Dashboard
        </p>
      </div>
    </div>
  );
}

