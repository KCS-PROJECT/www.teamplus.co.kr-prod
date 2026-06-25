"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import dynamic from "next/dynamic";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNativeUI } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";
import { useQrCheckin, type CheckinError } from "@/hooks/useQrCheckin";
import { MESSAGES } from "@/lib/messages";
import { isNativeApp } from "@/lib/environment";
import { qr as nativeQrBridge } from "@/services/native-bridge";

// Scanner 로드 전에 barcode-detector 폴리필의 zxing-wasm 경로를 로컬(public/wasm/)로 오버라이드.
// 기본값은 fastly.jsdelivr.net CDN이라 네트워크 환경에 따라 fetch 실패 가능.
// ⚠️ barcode-detector 는 zxing-wasm 과 별개의 setZXingModuleOverrides 를 제공하므로
//    반드시 'barcode-detector/pure' 에서 import 해야 함.
const Scanner = dynamic(
  async () => {
    const { setZXingModuleOverrides } = await import("barcode-detector/pure");
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? "/wasm/zxing_reader.wasm" : prefix + path,
    });
    const mod = await import("@yudiel/react-qr-scanner");
    return mod.Scanner;
  },
  { ssr: false },
);

type EnvIssue = "INSECURE_CONTEXT" | "NOT_SUPPORTED" | "PERMISSION_DENIED";

export default function QRScanPage() {
  // 학부모 대리 QR 출석 — childId/childName 쿼리가 있으면 그 자녀로 체크인.
  //   미지정(학생 본인 QR 스캔)이면 기존 동작 그대로.
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") ?? undefined;
  const childName = searchParams.get("childName") ?? undefined;
  const appBarTitle = childName
    ? MESSAGES.qrScan.proxyTitle(childName)
    : MESSAGES.qrScan.title;

  // [appbar-harness-v2] AppBar 유지 + BottomNav 숨김 (전체화면 카메라 뷰).
  //   showStatusBar:true 명시 — SPEC Step C 권장(기본값 true 지만 명시 선호).
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle,
    showBottomNav: false,
    showBackButton: true,
  });
  usePageReady(true); // 카메라 페이지 — UI 즉시 표시

  const router = useRouter();
  const { navigate } = useNavigation();
  const { state, result, error, checkIn, reset } = useQrCheckin();
  const [envIssue, setEnvIssue] = useState<EnvIssue | null>(null);
  // Flutter WebView 환경: 네이티브 카메라 Bridge 경로 사용
  const [nativeMode, setNativeMode] = useState(false);

  // ============================================
  // 환경 체크 (마운트 시 1회)
  // ============================================
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) Flutter 네이티브 WebView 감지 → 네이티브 카메라 Bridge 사용.
    // WebView 가 http://<IP>:5001 로 로드되면 Secure Context 가 아니어서
    // 브라우저 카메라 API 가 차단되므로, 네이티브 경로로 우회.
    if (isNativeApp()) {
      setNativeMode(true);
      return;
    }

    // 2) 브라우저 환경: HTTPS 또는 localhost 여부
    if (!window.isSecureContext) {
      setEnvIssue("INSECURE_CONTEXT");
      return;
    }

    // 3) mediaDevices 미지원 브라우저 (카메라 하드웨어 자체 부재)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setEnvIssue("NOT_SUPPORTED");
      return;
    }
    // 네이티브 BarcodeDetector 가 없어도 zxing-wasm 로컬 폴리필(/wasm/zxing_reader.wasm)
    // 으로 대체되므로 데스크탑 Chrome/Firefox/Edge 에서도 QR 스캔 가능.
  }, []);

  // ============================================
  // 네이티브 카메라 Bridge 자동 실행 (nativeMode === true)
  // state === 'idle' 일 때만 실행. reset() 으로 'error' → 'idle' 복귀 시
  // useEffect 가 재실행되어 네이티브 카메라가 자동 재시작됨.
  // ============================================
  useEffect(() => {
    if (!nativeMode) return;
    if (state !== "idle") return;

    let cancelled = false;
    (async () => {
      try {
        const uuid = await nativeQrBridge.scan();
        if (cancelled) return;
        if (uuid) {
          await checkIn(uuid, childId);
        } else {
          // 사용자 취소 — 이전 화면으로 복귀
          router.back();
        }
      } catch {
        if (cancelled) return;
        // Bridge 호출 실패 → 권한 문제로 간주하고 안내 표시
        setEnvIssue("PERMISSION_DENIED");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nativeMode, state, checkIn, router, childId]);

  // ============================================
  // 성공 시 이동
  // ============================================
  useEffect(() => {
    if (state === "success" && result) {
      const timer = setTimeout(() => {
        navigate(
          `/attendance-success?className=${encodeURIComponent(result.className)}`,
        );
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [state, result, navigate]);

  // ============================================
  // 스캔 핸들러
  // ============================================
  const handleScan = useCallback(
    (detected: IDetectedBarcode[]) => {
      const rawValue = detected[0]?.rawValue;
      if (rawValue) {
        checkIn(rawValue, childId);
      }
    },
    [checkIn, childId],
  );

  const handleScannerError = useCallback((err: unknown) => {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setEnvIssue("PERMISSION_DENIED");
      return;
    }

    // BarcodeDetector/WASM 미지원 환경 (Windows Chrome 등) — CDN fetch 실패 또는 네이티브 API 부재
    // 에러 메시지: "Barcode detection service unavailable", "wasm", "both async and sync fetching"
    if (
      name === "NotSupportedError" ||
      /BarcodeDetector|wasm|fetching of the wasm|detection service/i.test(
        message,
      )
    ) {
      setEnvIssue("NOT_SUPPORTED");
      return;
    }
  }, []);

  const handleRetryPermission = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  const scannerPaused =
    state === "checking" ||
    state === "success" ||
    state === "error" ||
    envIssue !== null;

  return (
    <MobileContainer className="bg-qr-bg text-white" hasBottomNav={false}>
      {/* [parent-agent · 2026-05-12] toneVariant="dark" — 카메라 미리보기와 톤 일치,
          status bar 가 카메라 영역에 가려지지 않도록 어두운 헤더 처리 (team-lead 권장). */}
      <PageAppBar title={appBarTitle} toneVariant="dark" />

      {/* 스크린리더용 상태 알림 — checking/success 는 polite, error 는 assertive */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state === "checking" && MESSAGES.qrScan.checking}
        {state === "success" && MESSAGES.qrScan.success}
      </span>
      <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {state === "error" && error?.message}
      </span>

      <main className="relative flex-1 overflow-hidden select-none bg-qr-bg">
        {/* ============================================
            네이티브 카메라 모드 (Flutter WebView 경로)
            ============================================ */}
        {nativeMode && envIssue === null && (
          <div className="absolute inset-0 z-0 flex items-center justify-center bg-qr-bg">
            <div className="flex flex-col items-center gap-4">
              <Icon
                name="qr_code_scanner"
                className="text-emerald-400 text-7xl motion-reduce:animate-none animate-pulse"
                weight={700}
                aria-hidden="true"
              />
              <p className="text-xl font-bold text-white text-center px-6">
                {MESSAGES.qrScan.scanning}
              </p>
            </div>
          </div>
        )}

        {/* ============================================
            브라우저 카메라 스캐너 (localhost/HTTPS 환경)
            ============================================ */}
        {!nativeMode && envIssue === null && (
          <div className="absolute inset-0 z-0">
            <Scanner
              onScan={handleScan}
              onError={handleScannerError}
              paused={scannerPaused}
              formats={["qr_code"]}
              constraints={{ facingMode: "environment" }}
              components={{
                finder: false,
                torch: true,
              }}
              styles={{
                container: { width: "100%", height: "100%" },
                video: { width: "100%", height: "100%", objectFit: "cover" },
              }}
            />
            {/* 카메라 뷰를 검게 — 디자인의 본격적인 다크 톤 적용 */}
            <div className="absolute inset-0 bg-qr-bg/55 pointer-events-none" />
          </div>
        )}

        {/* ============================================
            환경 문제 오버레이 (HTTPS/지원/권한)
            ============================================ */}
        {envIssue !== null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6 bg-rink-900">
            <div className="bg-white dark:bg-rink-800 rounded-w-2xl p-6 shadow-md max-w-sm w-full flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-w-pill bg-it-red-50 dark:bg-it-red-500/20 flex items-center justify-center">
                <Icon
                  name="videocam_off"
                  className="text-it-red-500 dark:text-it-red-300 text-4xl"
                  weight={700}
                  aria-hidden="true"
                />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-it-ink-800 dark:text-white mb-2">
                  {envIssue === "PERMISSION_DENIED"
                    ? MESSAGES.qrScan.permissionDeniedTitle
                    : MESSAGES.qrScan.title}
                </h3>
                <p className="text-card-title text-it-ink-700 dark:text-rink-100 leading-relaxed">
                  {envIssue === "INSECURE_CONTEXT" &&
                    MESSAGES.qrScan.insecureContext}
                  {envIssue === "NOT_SUPPORTED" && MESSAGES.qrScan.notSupported}
                  {envIssue === "PERMISSION_DENIED" &&
                    MESSAGES.qrScan.permissionDeniedBody}
                </p>
                {/* 카메라 권한 없이도 사용 가능한 대체 경로 안내 (iOS 5.1.1(iv)) */}
                {envIssue === "PERMISSION_DENIED" && (
                  <p className="mt-3 text-card-body text-it-ink-500 dark:text-rink-300 leading-relaxed">
                    {MESSAGES.qrScan.permissionAltHint}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 w-full mt-2">
                {envIssue === "PERMISSION_DENIED" && (
                  <button
                    type="button"
                    onClick={handleRetryPermission}
                    className="min-h-[72px] w-full rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-xl font-bold shadow-sm active:brightness-95 transition-[filter] motion-reduce:transition-none"
                  >
                    {MESSAGES.qrScan.permissionRetry}
                  </button>
                )}
                {/* 대체 경로 — 카메라 거부 시 내 QR 코드를 코치에게 제시(코치 스캔)하여 출석 */}
                {(envIssue === "PERMISSION_DENIED" ||
                  envIssue === "NOT_SUPPORTED" ||
                  envIssue === "INSECURE_CONTEXT") && (
                  <button
                    type="button"
                    onClick={() => navigate("/my-qr")}
                    className="min-h-[72px] w-full rounded-w-md bg-it-blue-800 hover:bg-it-blue-900 text-white text-xl font-bold active:brightness-95 transition-[filter] motion-reduce:transition-none dark:bg-rink-700 dark:hover:bg-rink-500"
                  >
                    {MESSAGES.qrScan.showMyQr}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="min-h-[72px] w-full rounded-w-md bg-it-fill dark:bg-rink-700 hover:bg-it-line dark:hover:bg-rink-500 text-it-ink-800 dark:text-white text-xl font-bold active:brightness-95 transition-[filter] motion-reduce:transition-none"
                >
                  {MESSAGES.qrScan.cancel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================
            뷰파인더 + 토글 칩 + 닫기 (브라우저 카메라 모드)
            — 네이티브 모드는 Flutter 스캐너 화면이 UI 담당
            ============================================ */}
        {!nativeMode &&
          envIssue === null &&
          state !== "error" &&
          state !== "success" && (
            <div className="relative z-10 flex flex-col h-full w-full">
              {/* 헤드라인 (카테고리 + 메인 카피) */}
              <div className="px-7 pt-[44px] pb-1 pointer-events-none">
                <p className="text-[13px] font-bold text-white/70 tracking-[-0.01em] mb-2">
                  출석체크 · 결제 · 입장권 · 코치인증
                </p>
                <h2 className="text-[22px] font-extrabold text-white tracking-[-0.03em] leading-[1.35]">
                  {childName
                    ? MESSAGES.qrScan.proxyHint(childName)
                    : "QR코드 찍고 빠르게 인증하세요!"}
                </h2>
              </div>

              {/* 뷰파인더 — 4 코너 브래킷 + 가운데 + + 스캔 라인 */}
              <div
                className="flex-1 flex items-center justify-center min-h-0 pointer-events-none"
                role="img"
                aria-label="QR 코드를 카메라에 비추세요"
              >
                <div className="relative w-[260px] h-[260px] max-w-[80vw] max-h-[80vw] aspect-square bg-white/[0.02]">
                  {/* 4 코너 브래킷 — qr-scan 그린 (RULE-7 합법적 예외: L자 코너 마커는 pipe-like 구분선이 아닌 카메라 가이드 시각 장치) */}
                  <div className="absolute top-0 left-0 w-9 h-9 border-t-4 border-l-4 border-qr-scan rounded-tl" />
                  <div className="absolute top-0 right-0 w-9 h-9 border-t-4 border-r-4 border-qr-scan rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-9 h-9 border-b-4 border-l-4 border-qr-scan rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-9 h-9 border-b-4 border-r-4 border-qr-scan rounded-br" />

                  {/* 가운데 + */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <svg
                      width={28}
                      height={28}
                      viewBox="0 0 28 28"
                      aria-hidden="true"
                    >
                      <path
                        d="M14 4v20M4 14h20"
                        stroke="#3DDC84"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  {/* 스캔 라인 — 솔리드 그린 + glow shadow */}
                  <div
                    className="absolute left-2 right-2 h-[2px] motion-reduce:hidden"
                    style={{
                      background: "linear-gradient(90deg, transparent, #3DDC84, transparent)",
                      boxShadow: "0 0 8px #3DDC84",
                      animation: "qrscan 2.4s ease-in-out infinite",
                    }}
                  />
                </div>
              </div>

              {/* 하단 — 토글 칩 + X 닫기 */}
              <div className="px-7 pb-7 flex flex-col items-center gap-[18px]">
                {/* 시각용 토글 칩 — 현재 모드(QR 스캔)만 활성, 나머지는 비활성 표기 */}
                <div
                  className="flex gap-2"
                  role="tablist"
                  aria-label="스캐너 모드"
                >
                  <span
                    role="tab"
                    aria-selected="true"
                    className="px-4 py-2 rounded-w-pill text-[12px] font-bold tracking-[-0.01em] bg-qr-scan/[0.18] text-qr-scan border border-qr-scan/40"
                  >
                    QR 스캔
                  </span>
                  <span
                    role="tab"
                    aria-selected="false"
                    aria-disabled="true"
                    className="px-4 py-2 rounded-w-pill text-[12px] font-bold tracking-[-0.01em] bg-white/[0.08] text-white/60 border border-transparent"
                  >
                    내 QR
                  </span>
                  <span
                    role="tab"
                    aria-selected="false"
                    aria-disabled="true"
                    className="px-4 py-2 rounded-w-pill text-[12px] font-bold tracking-[-0.01em] bg-white/[0.08] text-white/60 border border-transparent"
                  >
                    갤러리
                  </span>
                </div>

                {/* X 닫기 — router.back() */}
                <button
                  type="button"
                  onClick={() => router.back()}
                  aria-label={MESSAGES.qrScan.cancel}
                  className="w-[52px] h-[52px] rounded-w-pill border-[1.5px] border-white/40 bg-transparent flex items-center justify-center active:bg-white/10 transition-colors motion-reduce:transition-none"
                >
                  <svg
                    width={22}
                    height={22}
                    viewBox="0 0 22 22"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 5l12 12M17 5L5 17"
                      stroke="#fff"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                {/* 보조 안내 (스크린리더/접근성용) */}
                <p className="sr-only">{MESSAGES.qrScan.hint}</p>
              </div>
            </div>
          )}

        {/* ============================================
            체크인 중 오버레이
            ============================================ */}
        {state === "checking" && (
          <div className="absolute inset-0 z-40 bg-rink-900/70 flex items-center justify-center">
            <div className="bg-white dark:bg-rink-800 rounded-w-2xl p-8 shadow-md flex flex-col items-center gap-4">
              <Icon
                name="sync"
                className="text-it-blue-500 text-5xl animate-spin motion-reduce:animate-none"
                weight={700}
                aria-hidden="true"
              />
              <p className="text-card-title font-bold text-it-ink-800 dark:text-white">
                {MESSAGES.qrScan.checking}
              </p>
            </div>
          </div>
        )}

        {/* ============================================
            성공 오버레이 (자동 이동 전 짧은 피드백)
            ============================================ */}
        {state === "success" && (
          <div className="absolute inset-0 z-40 bg-it-blue-500/90 flex items-center justify-center">
            <div className="bg-white rounded-w-2xl p-8 shadow-md flex flex-col items-center gap-4 motion-reduce:animate-none animate-bounce">
              <Icon
                name="check_circle"
                filled
                className="text-emerald-500 text-7xl"
                weight={700}
                aria-hidden="true"
              />
              <p className="text-2xl font-bold text-it-ink-800">
                {MESSAGES.qrScan.success}
              </p>
            </div>
          </div>
        )}

        {/* ============================================
            에러 오버레이 (권한 외 비즈니스/네트워크 에러)
            ============================================ */}
        {state === "error" && error && (
          <ErrorOverlay
            error={error}
            onReset={reset}
            router={router}
            navigate={navigate}
            childId={childId}
          />
        )}

        <style jsx>{`
          @keyframes qrscan {
            0% {
              top: 8px;
              opacity: 0;
            }
            20% {
              opacity: 1;
            }
            80% {
              opacity: 1;
            }
            100% {
              top: calc(100% - 10px);
              opacity: 0;
            }
          }
        `}</style>
      </main>
    </MobileContainer>
  );
}

// ============================================
// 에러 오버레이 서브컴포넌트
// ============================================
interface ErrorOverlayProps {
  error: CheckinError;
  onReset: () => void;
  router: ReturnType<typeof useRouter>;
  navigate: (href: string) => void;
  childId?: string;
}

// 에러 코드별 아이콘·톤·주요 액션 단일 정의 — 분기 중복 제거로 일관성·유지보수성 확보
// ALREADY_CHECKED_IN: 경고 톤 (출석 완료 사실 알림) / NETWORK: 정보 톤 / 기타: 오류 톤
type ErrorStyle = {
  icon: string;
  bg: string;
  color: string;
};
const ERROR_STYLES: Record<CheckinError["code"], ErrorStyle> = {
  ALREADY_CHECKED_IN: {
    icon: "check_circle",
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    color: "text-yellow-600 dark:text-yellow-400",
  },
  INSUFFICIENT_CREDIT: {
    icon: "account_balance_wallet",
    bg: "bg-it-red-50 dark:bg-it-red-500/20",
    color: "text-it-red-500 dark:text-it-red-300",
  },
  NOT_REGISTERED: {
    icon: "school",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    color: "text-amber-600 dark:text-amber-400",
  },
  NETWORK: {
    icon: "wifi_off",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    color: "text-blue-600 dark:text-blue-400",
  },
  EXPIRED: {
    icon: "error",
    bg: "bg-it-red-50 dark:bg-it-red-500/20",
    color: "text-it-red-500 dark:text-it-red-300",
  },
  REUSED: {
    icon: "error",
    bg: "bg-it-red-50 dark:bg-it-red-500/20",
    color: "text-it-red-500 dark:text-it-red-300",
  },
  UNKNOWN: {
    icon: "error",
    bg: "bg-it-red-50 dark:bg-it-red-500/20",
    color: "text-it-red-500 dark:text-it-red-300",
  },
};

function ErrorOverlay({ error, onReset, router, navigate, childId }: ErrorOverlayProps) {
  const style = ERROR_STYLES[error.code];

  const primaryAction = (() => {
    if (error.code === "ALREADY_CHECKED_IN") {
      return {
        label: MESSAGES.qrScan.viewHistory,
        // 학부모 대리 스캔(childId 쿼리)이면 해당 자녀 출석 요약으로, 본인 스캔이면 학부모 출석 내역으로.
        onClick: () =>
          navigate(childId ? `/children/${childId}/attendance` : "/attendance-history"),
      };
    }
    if (error.code === "INSUFFICIENT_CREDIT") {
      return {
        label: MESSAGES.qrScan.chargeCredit,
        onClick: () => navigate("/credits"),
      };
    }
    if (error.code === "NOT_REGISTERED") {
      // 재스캔해도 동일 결과 — 뒤로가기를 primary 로, 재스캔은 secondary 로
      return {
        label: MESSAGES.qrScan.cancel,
        onClick: () => router.back(),
      };
    }
    if (error.code === "NETWORK") {
      return {
        label: MESSAGES.qrScan.networkRetry,
        onClick: onReset,
      };
    }
    return {
      label: MESSAGES.qrScan.scanAgain,
      onClick: onReset,
    };
  })();

  const secondaryAction = (() => {
    if (
      error.code === "ALREADY_CHECKED_IN" ||
      error.code === "NOT_REGISTERED"
    ) {
      // primary 가 "이력 보기"·"돌아가기" 이므로 secondary 는 재스캔 허용
      return {
        label: MESSAGES.qrScan.scanAgain,
        onClick: onReset,
      };
    }
    return {
      label: MESSAGES.qrScan.cancel,
      onClick: () => router.back(),
    };
  })();

  return (
    <div
      className="absolute inset-0 z-40 bg-rink-900/80 flex items-center justify-center px-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="qr-scan-error-title"
    >
      <div className="bg-white dark:bg-rink-800 rounded-w-2xl p-6 shadow-md max-w-sm w-full flex flex-col items-center gap-4">
        <div
          className={`w-16 h-16 rounded-w-pill ${style.bg} flex items-center justify-center`}
        >
          <Icon
            name={style.icon}
            className={`${style.color} text-4xl`}
            weight={700}
            aria-hidden="true"
          />
        </div>
        <p
          id="qr-scan-error-title"
          className="text-card-title font-bold text-it-ink-800 dark:text-white text-center leading-relaxed"
        >
          {error.message}
        </p>
        <div className="flex flex-col gap-2 w-full mt-2">
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="min-h-[72px] w-full rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-xl font-bold shadow-sm active:brightness-95 transition-[filter] motion-reduce:transition-none"
          >
            {primaryAction.label}
          </button>
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="min-h-[72px] w-full rounded-w-md bg-it-fill dark:bg-rink-700 hover:bg-it-line dark:hover:bg-rink-500 text-it-ink-800 dark:text-white text-xl font-bold active:brightness-95 transition-[filter] motion-reduce:transition-none"
          >
            {secondaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
