'use client';

import { useEffect } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { devError } from '@/lib/logger';
import { MESSAGES } from '@/lib/messages';

export default function RouteGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    devError('Route error:', error);
  }, [error]);

  return (
    <MobileContainer>
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        role="alert"
        aria-live="polite"
      >
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-6">
          <Icon name="error" className="text-red-500 dark:text-red-400" size={32} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {MESSAGES.error.general}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8">
          잠시 후 다시 시도해주세요.
        </p>
        <Button
          onClick={reset}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl"
        >
          다시 시도하기
        </Button>
      </div>
    </MobileContainer>
  );
}
