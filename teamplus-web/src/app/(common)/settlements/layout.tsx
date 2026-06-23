'use client';

import { useRequireRole } from '@/contexts/AuthContext';

export default function SettlementsLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['admin', 'director', 'coach']);

  if (isLoading) return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  if (!isAllowed) return null;

  return <>{children}</>;
}
