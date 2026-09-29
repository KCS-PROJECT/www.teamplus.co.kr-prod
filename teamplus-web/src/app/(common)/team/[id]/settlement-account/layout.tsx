'use client';

import { useRequireRole } from '@/contexts/AuthContext';

export default function TeamSettlementAccountLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['director']);

  if (isLoading) return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  if (!isAllowed) return null;

  return <>{children}</>;
}
