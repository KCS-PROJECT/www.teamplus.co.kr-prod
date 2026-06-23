export default function Loading() {
  return (
    <div className="animate-admin-fade-in space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-28 rounded skeleton-shimmer" />
        <div className="h-4 w-44 rounded skeleton-shimmer" />
      </div>

      {/* 통계 카드 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-admin-slide-up stagger-${i}`}
          >
            <div className="h-4 w-20 rounded skeleton-shimmer mb-3" />
            <div className="h-8 w-24 rounded skeleton-shimmer mb-2" />
            <div className="h-3 w-16 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 animate-admin-slide-up stagger-5">
          <div className="h-5 w-32 rounded skeleton-shimmer mb-4" />
          <div className="h-48 rounded-lg skeleton-shimmer" />
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 animate-admin-slide-up stagger-6">
          <div className="h-5 w-28 rounded skeleton-shimmer mb-4" />
          <div className="h-48 rounded-lg skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
