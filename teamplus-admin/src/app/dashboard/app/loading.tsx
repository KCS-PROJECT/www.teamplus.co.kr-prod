import { SkeletonCard } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="animate-admin-fade-in space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-28 rounded skeleton-shimmer" />
        <div className="h-4 w-40 rounded skeleton-shimmer" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard count={4} />
      </div>
    </div>
  );
}
