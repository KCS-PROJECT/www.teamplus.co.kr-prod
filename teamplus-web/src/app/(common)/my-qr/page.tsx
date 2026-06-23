"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import nextDynamic from "next/dynamic";
// ⚡ qrcode.react(~12KB gzip) 는 dynamic import 로 지연 로드 — 초기 번들 감소
const QRCodeSVG = nextDynamic(
  () => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })),
  { ssr: false },
);
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { api } from "@/services/api-client";
import { openShareSheet } from "@/lib/share";
import { useToast } from "@/components/ui/Toast";

/**
 * MyQrPage - 내 프로필 QR
 * Route: /my-qr
 *
 * 데이터: GET /api/v1/users/me/qr-token (JWT 15분 TTL)
 * - 카운트다운 + 만료 시 자동 비활성화
 * - 새로고침 버튼
 * - 공유 버튼 (openShareSheet · 카카오/페북/X/링크복사)
 */

interface QrTokenResponse {
  token: string;
  expiresAt: string;
  ttl: number;
}

function getRoleLabel(userType?: string): string {
  const map: Record<string, string> = {
    admin: "관리자",
    director: "감독",
    coach: "코치",
    parent: "학부모",
    teen: "학생",
    child: "어린이",
    academy_director: "감독",
  };
  return map[userType?.toLowerCase() ?? ""] ?? "회원";
}

export default function MyQrPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { user } = useSessionAuth();
  const { toast } = useToast();
  const [qrData, setQrData] = useState<QrTokenResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [remainingSec, setRemainingSec] = useState(0);

  const loadQr = useCallback(async () => {
    setIsLoading(true);
    const res = await api.get<QrTokenResponse>("/users/me/qr-token");
    if (res.success && res.data) {
      setQrData(res.data);
      const expires = new Date(res.data.expiresAt).getTime();
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setRemainingSec(diff);
    } else {
      toast.error("QR 토큰 발급에 실패했습니다.");
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadQr();
  }, [loadQr]);

  // 카운트다운
  useEffect(() => {
    if (!qrData || remainingSec <= 0) return;
    const interval = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrData, remainingSec]);

  const handleRefresh = () => {
    void loadQr();
  };

  const handleShare = () => {
    openShareSheet({
      title: "내 프로필",
      text: `${user?.name ?? "사용자"}님의 프로필 QR`,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
  };

  const isExpired = remainingSec === 0 && !isLoading;
  const formatRemaining = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <MobileContainer hasBottomNav={false} className="selectable-text">
      <PageAppBar
        title="내 QR"
        forceNative
        // [appbar-harness-v4 분류 C→A] rightActions 단독 사용 시 우측 3 액션(시계/종/메뉴)이 모두 사라짐.
        //   extraActions 로 변환하여 ☰ 메뉴는 항상 노출 (PageAppBar v2.3 SoT 정책).
        extraActions={[
          { icon: "refresh", onClick: handleRefresh, label: "새로고침" },
        ]}
      />

      {/* [수정 2026-05-13 D23] App 환경에서 '공유하기/새로고침' 버튼 위치가 너무 낮아
         viewport 하단에 가려진다는 보고. 수직 여백 축소 (py-8→pt-5 pb 안전영역)
         + 섹션 간격 mb-8→mb-5, mb-6→mb-4 로 단축. 하단 패딩에 safe-area-inset-bottom
         포함하여 홈인디케이터 영역과의 충돌 방지. */}
      <main
        className="flex-1 overflow-y-auto px-6 pt-5 flex flex-col items-center"
        style={{ paddingBottom: 'calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
      >
        {/* 프로필 정보 */}
        <div className="text-center mb-5">
          <div className="w-20 h-20 rounded-w-pill bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center mx-auto mb-3">
            <Icon name="person" className="text-5xl text-ice-500" />
          </div>
          <p className="text-xl font-bold text-wtext-1 dark:text-white">
            {user?.name ?? "사용자"}님
          </p>
          <span className="inline-block mt-2 text-w-caption font-bold px-2 py-0.5 rounded bg-ice-500/10 text-ice-500">
            {getRoleLabel(user?.userType)}
          </span>
        </div>

        {/* QR 코드 */}
        <div className="w-full max-w-xs bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-2xl p-6 mb-4">
          {isLoading ? (
            <div className="aspect-square flex items-center justify-center bg-wbg dark:bg-rink-900 rounded-lg">
              <div className="w-10 h-10 rounded-w-pill border-2 border-ice-500/20 border-t-primary animate-spin motion-reduce:animate-none" />
            </div>
          ) : isExpired || !qrData ? (
            <div className="aspect-square flex flex-col items-center justify-center bg-wbg dark:bg-rink-900 rounded-lg">
              <Icon
                name="qr_code_2"
                className="text-6xl text-wtext-4 dark:text-rink-500 mb-2"
              />
              <p className="text-w-small font-semibold text-wtext-3 dark:text-rink-300">
                QR이 만료되었습니다
              </p>
              <button
                onClick={handleRefresh}
                className="mt-3 h-10 px-5 rounded-lg bg-ice-500 text-white text-w-small font-semibold"
              >
                새로 발급받기
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <QRCodeSVG
                value={qrData.token}
                size={240}
                level="M"
                includeMargin={false}
              />
            </div>
          )}
        </div>

        {/* 남은 시간 */}
        {qrData && !isExpired && (
          <div className="flex items-center gap-2 mb-3">
            <Icon name="schedule" className="text-wtext-3 text-[20px]" />
            <span className="text-w-small font-semibold text-wtext-2 dark:text-rink-100">
              남은 시간: {formatRemaining(remainingSec)}
            </span>
          </div>
        )}

        {/* 안내 */}
        <p className="text-w-caption text-wtext-3 dark:text-rink-300 text-center max-w-[280px] mb-4 leading-relaxed">
          상대방이 QR 스캐너로 이 QR을 스캔하면 제 프로필을 확인할 수 있어요.
          15분 후 자동으로 만료됩니다.
        </p>

        {/* 액션 */}
        <div className="w-full max-w-xs flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={handleShare}>
            공유하기
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleRefresh}>
            새로고침
          </Button>
        </div>
      </main>
    </MobileContainer>
  );
}
