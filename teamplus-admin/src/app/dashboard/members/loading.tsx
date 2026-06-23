import { SkeletonTable } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="animate-admin-fade-in space-y-6">
      {/* 페이지 헤더 스켈레톤 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded skeleton-shimmer" />
          <div className="h-4 w-48 rounded skeleton-shimmer" />
        </div>
        <div className="h-10 w-28 rounded-lg skeleton-shimmer" />
      </div>

      {/* 검색/필터 바 스켈레톤 */}
      <div className="flex gap-3">
        <div className="h-10 flex-1 max-w-sm rounded-lg skeleton-shimmer" />
        <div className="h-10 w-24 rounded-lg skeleton-shimmer" />
      </div>

      {/* 테이블 스켈레톤 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <SkeletonTable rows={8} columns={5} />
      </div>
    </div>
  );
}
