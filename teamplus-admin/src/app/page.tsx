'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = () => {
      if (authService.isAuthenticated()) {
        // If authenticated, redirect to dashboard
        router.push('/dashboard');
      } else {
        // If not authenticated, redirect to login
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  // Return loading state while redirecting
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 border-4 border-primary border-t-transparent rounded-full motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true"></div>
        <p className="text-sm text-slate-500 dark:text-slate-400">잠시만 기다려 주세요...</p>
      </div>
    </div>
  );
}
