'use client';

/**
 * Global Error Page (500)
 * Next.js 14 App Router 전역 에러 핸들러
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center rounded-xl shadow-sm">
        {/* 아이콘 */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        {/* 제목 */}
        <h1 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
          오류가 발생했습니다
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          일시적인 오류가 발생했습니다. 다시 시도하거나 문제가 지속되면 관리자에게 문의해주세요.
        </p>

        {/* 에러 코드 (digest) */}
        {error.digest && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 font-mono bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
            오류 코드: {error.digest}
          </p>
        )}

        {/* 액션 버튼 */}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            onClick={reset}
            className="w-full bg-primary hover:bg-primary-dark text-white gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </Button>
          <Link href="/dashboard">
            <Button variant="outline" className="w-full border-slate-300 dark:border-slate-600">
              대시보드로 이동
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
