import { SkeletonTable } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="animate-admin-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-28 rounded skeleton-shimmer" />
          <div className="h-4 w-40 rounded skeleton-shimmer" />
        </div>
      </div>

      {/* 통계 카드 스켈레톤 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['stagger-1', 'stagger-2', 'stagger-3'] as const).map((staggerClass, idx) => (
          <div
            key={idx}
            className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-admin-slide-up ${staggerClass}`}
          >
            <div className="h-4 w-20 rounded skeleton-shimmer mb-3" />
            <div className="h-8 w-32 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <SkeletonTable rows={6} columns={5} />
      </div>
    </div>
  );
}
