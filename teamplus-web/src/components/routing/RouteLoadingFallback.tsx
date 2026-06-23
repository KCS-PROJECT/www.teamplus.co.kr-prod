/**
 * RouteLoadingFallback
 *
 * Next App Router `loading.tsx` fallback marker. The visual full-screen loader
 * is owned by LoadingProvider; this marker lets LoadingProvider keep that loader
 * mounted until the real route segment replaces the fallback.
 */
export function RouteLoadingFallback() {
  return (
    <div
      data-route-loading-fallback="true"
      className="min-h-screen bg-wbg dark:bg-puck"
      aria-busy="true"
    />
  );
}
