import { SkeletonTable } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="animate-admin-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded skeleton-shimmer" />
          <div className="h-4 w-44 rounded skeleton-shimmer" />
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <SkeletonTable rows={6} columns={4} />
      </div>
    </div>
  );
}
