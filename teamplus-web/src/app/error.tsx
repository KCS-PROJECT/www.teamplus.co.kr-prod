"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { devError } from "@/lib/logger";

/**
 * Global Error Page - Next.js App Router
 *
 * 앱 전체에서 발생하는 에러를 처리합니다.
 * 클라이언트 컴포넌트여야 합니다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { navigate } = useNavigation();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleGoHome = () => {
    setIsNavigating(true);
    navigate("/");
  };

  useEffect(() => {
    // 개발 환경 에러 로깅
    if (process.env.NODE_ENV === "development") {
      devError("Global error:", error);
    }

    // 프로덕션 에러 리포팅 (Sentry 연동 - 동적 import로 빌드 경고 방지)
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureException(error, {
          extra: {
            digest: error.digest,
          },
          tags: {
            source: "GlobalErrorPage",
          },
        });
      })
      .catch(() => {
        // Sentry 로드 실패 시 콘솔에만 로그
        devError("[ErrorPage] Sentry load failed, error:", error);
      });
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-md p-8 text-center">
        {/* 에러 아이콘 */}
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon
            name="error"
            className="text-red-600 dark:text-red-400"
            size={48}
            decorative={false}
            ariaLabel="오류 발생"
          />
        </div>

        {/* 에러 메시지 */}
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          문제가 발생했습니다
        </h1>

        <p className="text-slate-600 dark:text-slate-400 mb-6">
          죄송합니다. 페이지를 불러오는 중 오류가 발생했습니다. 잠시 후 다시
          시도해주세요.
        </p>

        {/* 개발 환경에서 에러 상세 표시 */}
        {process.env.NODE_ENV === "development" && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-left">
            <p className="text-xs font-mono text-red-700 dark:text-red-300 break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs font-mono text-red-500 mt-2">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="primary"
            onClick={reset}
            className="min-w-[140px]"
            disabled={isNavigating}
          >
            다시 시도
          </Button>
          <Button
            variant="outline"
            onClick={handleGoHome}
            className="min-w-[140px]"
            disabled={isNavigating}
            loading={isNavigating}
          >
            홈으로 이동
          </Button>
        </div>
      </div>

      {/* 하단 안내 */}
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-8">
        문제가 계속되면{" "}
        <a
          href="mailto:support@teamplus.com"
          className="text-primary hover:underline"
        >
          고객센터
        </a>
        에 문의해주세요.
      </p>
    </div>
  );
}
