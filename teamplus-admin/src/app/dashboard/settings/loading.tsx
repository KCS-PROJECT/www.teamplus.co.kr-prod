import { SkeletonCard } from '@/components/ui/loading-spinner';

export default function Loading() {
  return (
    <div className="animate-admin-fade-in space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-24 rounded skeleton-shimmer" />
        <div className="h-4 w-36 rounded skeleton-shimmer" />
      </div>
      <SkeletonCard count={3} />
    </div>
  );
}
