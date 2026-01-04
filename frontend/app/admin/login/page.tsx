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
      <div className="w-full max-w-[512px] mx-4">
        <div className="bg-white rounded-[15px] shadow-lg">
          {/* Header */}
          <div style={{ padding: '24px', borderBottom: '1px solid #cbd5e1' }}>
            <div className="flex items-start" style={{ gap: '12px' }}>
              <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '28px', height: '28px' }}>
                <img 
                  src="/logo.png" 
                  alt="ADA Clara Logo" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div className="flex-1">
                <h1 className="text-[#020617] text-xl font-normal m-0" style={{ marginBottom: '4px' }}>Admin Login</h1>
                <p className="text-[#64748b] text-sm font-normal m-0" style={{ lineHeight: '20px' }}>
                  Sign in to access the admin dashboard
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#020617] m-0" style={{ marginBottom: '8px' }}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter your email address"
                  className="w-full border border-[#cbd5e1] rounded-[10px] h-[44px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
                  style={{ paddingLeft: '12px', paddingRight: '12px' }}
                  disabled={loading}
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#020617] m-0" style={{ marginBottom: '8px' }}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  className="w-full border border-[#cbd5e1] rounded-[10px] h-[44px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
                  style={{ paddingLeft: '12px', paddingRight: '12px' }}
                  disabled={loading}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-[10px] p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-[48px] bg-[#a6192e] text-white rounded-[10px] text-sm font-normal hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#94a3b8]" style={{ marginTop: '32px' }}>
          ADA Clara Admin Dashboard
        </p>
      </div>
    </div>
  );
}

