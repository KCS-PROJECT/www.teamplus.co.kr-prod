"use client";

import { useEffect, useState } from "react";
import { devError } from "@/lib/logger";

/**
 * Global Error Handler - Next.js App Router
 *
 * 최상위 레벨에서 발생하는 에러를 처리합니다.
 * 이 컴포넌트는 root layout을 포함한 모든 에러를 캐치합니다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isNavigating, setIsNavigating] = useState(false);

  const handleGoHome = () => {
    setIsNavigating(true);
    // Context 사용 불가하므로 window.location 사용하되 스피너 표시
    setTimeout(() => {
      window.location.href = "/";
    }, 100);
  };

  useEffect(() => {
    // Sentry에 에러 전송 (동적 import로 빌드 경고 방지)
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureException(error, {
          extra: {
            digest: error.digest,
          },
          tags: {
            source: "GlobalError",
            level: "critical",
          },
        });
      })
      .catch(() => {
        // Sentry 로드 실패 시 콘솔에만 로그
        devError("[GlobalError] Sentry load failed, error:", error);
      });
  }, [error]);

  // 네비게이션 중이면 스피너 표시
  if (isNavigating) {
    return (
      <html lang="ko">
        <body>
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid var(--color-border)",
                borderTop: "3px solid var(--color-primary)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <p
              style={{
                marginTop: "16px",
                color: "var(--color-text-secondary)",
                fontSize: "14px",
              }}
            >
              이동 중...
            </p>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ko">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            backgroundColor: "var(--color-background)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "400px",
              width: "100%",
              backgroundColor: "var(--color-surface)",
              borderRadius: "16px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              padding: "32px",
              textAlign: "center",
            }}
          >
            {/* 에러 아이콘 */}
            <div
              style={{
                width: "64px",
                height: "64px",
                backgroundColor: "hsl(var(--ice-error) / 0.15)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-error)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* 에러 메시지 */}
            <h1
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "var(--color-text-primary)",
                marginBottom: "12px",
              }}
            >
              문제가 발생했습니다
            </h1>

            <p
              style={{
                color: "var(--color-text-secondary)",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              죄송합니다. 예기치 않은 오류가 발생했습니다. 페이지를
              새로고침해주세요.
            </p>

            {/* 액션 버튼 */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <button
                onClick={reset}
                disabled={isNavigating}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "var(--color-primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: isNavigating ? "not-allowed" : "pointer",
                  opacity: isNavigating ? 0.7 : 1,
                }}
              >
                다시 시도
              </button>
              <button
                onClick={handleGoHome}
                disabled={isNavigating}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: isNavigating ? "not-allowed" : "pointer",
                  opacity: isNavigating ? 0.7 : 1,
                }}
              >
                홈으로 이동
              </button>
            </div>
          </div>

          {/* 하단 안내 */}
          <p
            style={{
              marginTop: "32px",
              fontSize: "14px",
              color: "var(--color-text-muted)",
            }}
          >
            문제가 계속되면{" "}
            <a
              href="mailto:support@teamplus.com"
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
              }}
            >
              고객센터
            </a>
            에 문의해주세요.
          </p>
        </div>
      </body>
    </html>
  );
}
