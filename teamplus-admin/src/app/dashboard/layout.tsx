'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';

/**
 * Dashboard Layout Wrapper
 *
 * Note: suppressHydrationWarning is used to prevent hydration warnings
 * caused by browser extensions (e.g., Bitdefender) that inject attributes
 * like 'bis_skin_checked' into DOM elements after server-side rendering.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div suppressHydrationWarning>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </div>
  );
}
