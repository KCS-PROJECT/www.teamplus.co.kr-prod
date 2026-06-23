"use client";

/**
 * 글로벌 TanStack Query Provider (2026-06-07 · CODE_REVIEW_ADMIN D-2)
 *
 * 기존에는 페이지마다 별도 QueryClient + QueryClientProvider 를 생성해 라우트 이동 시
 * 캐시가 공유되지 않고 재요청이 발생했다. 루트 레이아웃 단일 Provider 로 통합해
 * 전 대시보드가 동일 캐시(staleTime/gcTime)를 공유하도록 한다.
 *
 * `useState(() => new QueryClient(...))` 로 클라이언트당 1회만 생성(리렌더 시 재생성 방지).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000, // 60초 — 포커스 refetch 폭탄 차단
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
