"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { Icon } from "@/components/ui/Icon";
import { NavLink } from "@/components/ui/NavLink";
import PinInput from "@/components/ui/PinInput";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useKeyboardAvoidance } from "@/hooks/useKeyboardAvoidance";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { api } from "@/services/api-client";
import { hybridAuth } from "@/services/hybrid-auth";
import { MESSAGES } from "@/lib/messages";
import {
  CHILD_PIN_CHALLENGE_KEY,
  CHILD_PIN_OTP_SENT_AT_KEY,
} from "@/lib/session-keys";

// OTP 타이밍 상수 (백엔드와 일치)
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_TTL_SECONDS = 180;
import { isNativeApp } from "@/lib/environment";
import type { LoginResponse } from "@/services/auth";
import { usePageReady } from "@/hooks/usePageReady";

type ChildPinMode = "fixed" | "otp";

interface ChildPinVerifyDto {
  childEmail: string;
  pin: string;
  challengeToken: string;
}

interface ChildOtpRequestDto {
  childEmail: string;
  challengeToken: string;
}

interface ChildOtpRequestResponse {
  reused: boolean;
  resendAvailableInSeconds: number;
}

interface ChildOtpVerifyDto {
  childEmail: string;
  otp: string;
  challengeToken: string;
}

const CHILD_PIN_MESSAGES = {
  required: "어린이 인증이 필요합니다",
  invalid: "인증 정보가 올바르지 않습니다.",
  locked: "인증 시도가 잠시 제한되었습니다.",
  otpExpired: "인증번호가 만료되었습니다.",
  parentNotFound: "보호자 연결 정보를 찾을 수 없습니다.",
  sessionExpired: "인증 시간이 만료되었습니다. 다시 로그인해주세요.",
  enterPin: "등록된 6자리 PIN을 입력해주세요.",
  enterOtp: "보호자에게 전송된 인증번호 6자리를 입력해주세요.",
  verifying: "확인 중",
  verify: "확인",
  forgotPin: "PIN을 잊으셨나요?",
  askParent: "보호자에게 PIN 재설정을 요청해주세요.",
  otpAlreadySent: "이미 발송된 인증번호를 사용할 수 있습니다.",
  otpRemainingTime: (minutes: number, seconds: number) =>
    `남은 시간 ${minutes}:${seconds.toString().padStart(2, "0")}`,
  otpSent: "인증번호가 보호자에게 전송되었습니다.",
  resend: "재발송",
};

// ========== OTP 카운트다운 훅 ==========

function useCountdown(defaultSeconds: number) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(
    (override?: number) => {
      // override가 0이면 즉시 종료(재발송 가능 상태), undefined면 defaultSeconds, 양수면 해당 값
      const next =
        typeof override === "number" ? Math.max(0, override) : defaultSeconds;
      setSeconds(next);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (next <= 0) return; // 0이면 타이머 시작 안 함
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [defaultSeconds],
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { seconds, isActive: seconds > 0, start };
}

// ========== 에러 코드 → 메시지 매핑 ==========

function mapErrorMessage(
  code: string | undefined,
  backendMessage?: string,
): string {
  switch (code) {
    case "PIN_INVALID":
      // 백엔드가 "PIN이 일치하지 않습니다. (N회 남음)" 상세 메시지 전달
      return backendMessage ?? CHILD_PIN_MESSAGES.invalid;
    case "PIN_LOCKED":
      return backendMessage ?? CHILD_PIN_MESSAGES.locked;
    case "OTP_INVALID":
      return backendMessage ?? CHILD_PIN_MESSAGES.invalid;
    case "OTP_EXPIRED":
      return backendMessage ?? CHILD_PIN_MESSAGES.otpExpired;
    case "OTP_LOCKED":
      return backendMessage ?? CHILD_PIN_MESSAGES.locked;
    case "PARENT_CHILD_RELATION_NOT_FOUND":
      return CHILD_PIN_MESSAGES.parentNotFound;
    case "SMS_RATE_LIMIT":
    case "Bad Request":
      // 백엔드 한글 메시지에 남은 시간 정보가 포함됨 ("잠시 후 다시 시도해주세요. (N초 후 재발송 가능)")
      return backendMessage ?? MESSAGES.error.general;
    case "CHALLENGE_EXPIRED":
    case "INVALID_CHALLENGE":
      return CHILD_PIN_MESSAGES.sessionExpired;
    default:
      return MESSAGES.error.general;
  }
}

// ========== Challenge Token 유효성 검사 ==========

/**
 * JWT 토큰의 exp 필드를 클라이언트에서 사전 확인.
 * 서명 검증은 서버에서만 가능하며, 여기서는 만료 여부만 판단해 UI 렌더 전 차단.
 */
function isChallengeTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// ========== 토큰 저장 + 쿠키 설정 ==========

async function saveAuthTokens(accessToken: string, refreshToken: string) {
  await hybridAuth.saveToken({ accessToken, refreshToken });
  if (typeof document !== "undefined") {
    const maxAge = 60 * 60 * 24 * 7;
    // [2026-06-10 SECURITY] HTTPS 에서 Secure 플래그 부착 — 평문 전송 차단.
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `teamplus_access_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
  }
}

// ========== 메인 컴포넌트 ==========

export default function ChildPinPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });

  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useSessionAuth();
  // 키보드 회피 — PIN/OTP 입력 시 활성 input 자동 viewport 스크롤 (SCREEN_METRICS §5.4)
  const formContainerRef = useRef<HTMLDivElement>(null);
  useKeyboardAvoidance(formContainerRef);
  const email = searchParams?.get("email") || "";
  const mode = (searchParams?.get("mode") || "otp") as ChildPinMode;

  /**
   * 인증 게이트 — Hydration-safe 패턴
   * 초기값은 항상 false (SSR/CSR 매치) → 하이드레이션 후 useEffect로 실제 검증
   */
  const [authChecked, setAuthChecked] = useState(false);

  // 공통 상태
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OTP 모드 상태 — 페이지 진입 시 자동 발송 후 PIN 입력으로 직행
  const [otp, setOtp] = useState("");
  const [initializing, setInitializing] = useState(mode === "otp");
  const [isReusedOtp, setIsReusedOtp] = useState(false);
  const countdown = useCountdown(60);
  const hasAutoRequestedRef = useRef(false);

  // 하이드레이션 후 실제 인증 검증 (sessionStorage 접근 + challengeToken 유효성 + 만료 체크)
  useEffect(() => {
    if (!email) {
      router.replace("/login");
      return;
    }
    const token = sessionStorage.getItem(CHILD_PIN_CHALLENGE_KEY);
    if (!isChallengeTokenValid(token)) {
      if (token) sessionStorage.removeItem(CHILD_PIN_CHALLENGE_KEY);
      router.replace("/login");
      return;
    }
    setAuthChecked(true);
  }, [email, router]);

  const navigateToDashboard = useCallback(() => {
    const path = "/child";
    setTimeout(() => {
      if (isNativeApp() && typeof window !== "undefined") {
        if (window.__NEXT_ROUTER_PUSH__) {
          window.__NEXT_ROUTER_PUSH__(path);
          return;
        }
        if (window.teamplusNavigate) {
          window.teamplusNavigate(path);
          return;
        }
      }
      router.replace(path, { scroll: false });
    }, 150);
  }, [router]);

  // ========== OTP 발송 (자동 진입 시 + 재발송 공용) ==========

  // Challenge Token 만료/무효 시 sessionStorage 정리 후 로그인으로 이동
  const handleChallengeTokenError = useCallback(
    (code: string | undefined) => {
      if (code === "CHALLENGE_EXPIRED" || code === "INVALID_CHALLENGE") {
        sessionStorage.removeItem(CHILD_PIN_CHALLENGE_KEY);
        sessionStorage.removeItem(CHILD_PIN_OTP_SENT_AT_KEY);
        setTimeout(() => {
          router.replace("/login");
        }, 1500);
      }
    },
    [router],
  );

  const sendOtp = useCallback(async () => {
    const challengeToken =
      sessionStorage.getItem(CHILD_PIN_CHALLENGE_KEY) ?? "";
    const body: ChildOtpRequestDto = { childEmail: email, challengeToken };
    const response = await api.post<ChildOtpRequestResponse>(
      "/child-auth/request-otp",
      body,
    );

    if (response.success && response.data) {
      // 신규 발송 시에만 타임스탬프 저장 (재사용 시 기존 타임스탬프 유지)
      if (!response.data.reused) {
        sessionStorage.setItem(
          CHILD_PIN_OTP_SENT_AT_KEY,
          Date.now().toString(),
        );
      }
      setIsReusedOtp(response.data.reused);
      // 재발송 가능 쿨다운(resendAvailableInSeconds)만 카운트다운에 사용 (OTP 유효 시간은 별개)
      countdown.start(response.data.resendAvailableInSeconds);
      setOtp("");
      return true;
    }
    setError(mapErrorMessage(response.error?.code, response.error?.message));
    handleChallengeTokenError(response.error?.code);
    return false;
  }, [email, countdown, handleChallengeTokenError]);

  // ========== 페이지 마운트 시 OTP 자동 발송 (mode=otp 한정) ==========
  //
  // 캐시 체크/카운트다운 복원은 매 마운트마다 실행 (StrictMode 및 뒤로/앞으로 지원).
  // hasAutoRequestedRef는 "API 호출" 중복만 방지하도록 범위 한정.

  useEffect(() => {
    if (mode !== "otp" || !email || !authChecked) return;

    // 1. 로컬 캐시 확인 — OTP TTL 내면 API 호출 skip (Throttler 부담 제거)
    const sentAtStr = sessionStorage.getItem(CHILD_PIN_OTP_SENT_AT_KEY);
    if (sentAtStr) {
      const elapsedSec = (Date.now() - parseInt(sentAtStr, 10)) / 1000;
      if (elapsedSec < OTP_TTL_SECONDS) {
        // 활성 OTP가 로컬에서 확인됨 → 백엔드 호출 없이 재사용 상태로 복원
        setIsReusedOtp(true);
        const cooldownRemaining = Math.max(
          0,
          OTP_RESEND_COOLDOWN_SECONDS - elapsedSec,
        );
        countdown.start(Math.floor(cooldownRemaining));
        setInitializing(false);
        return;
      }
      // 캐시 만료 → 제거
      sessionStorage.removeItem(CHILD_PIN_OTP_SENT_AT_KEY);
    }

    // 2. 캐시 없음/만료 → 실제 API 호출 (단 1회)
    if (hasAutoRequestedRef.current) return;
    hasAutoRequestedRef.current = true;
    void (async () => {
      await sendOtp();
      setInitializing(false);
    })();
  }, [mode, email, authChecked, sendOtp, countdown]);

  // ========== mode=fixed: 고정 PIN 검증 ==========

  const handleFixedPinSubmit = useCallback(async () => {
    if (pin.length !== 6 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const challengeToken =
      sessionStorage.getItem(CHILD_PIN_CHALLENGE_KEY) ?? "";
    const body: ChildPinVerifyDto = { childEmail: email, pin, challengeToken };
    const response = await api.post<LoginResponse>(
      "/child-auth/verify-and-login",
      body,
    );

    if (
      response.success &&
      response.data?.accessToken &&
      response.data?.refreshToken
    ) {
      sessionStorage.removeItem(CHILD_PIN_CHALLENGE_KEY);
      sessionStorage.removeItem(CHILD_PIN_OTP_SENT_AT_KEY);
      await saveAuthTokens(
        response.data.accessToken,
        response.data.refreshToken,
      );
      await refreshUser();
      navigateToDashboard();
    } else {
      setPin("");
      setError(mapErrorMessage(response.error?.code, response.error?.message));
      handleChallengeTokenError(response.error?.code);
    }
    setIsSubmitting(false);
  }, [
    pin,
    email,
    isSubmitting,
    navigateToDashboard,
    refreshUser,
    handleChallengeTokenError,
  ]);

  // ========== mode=otp: OTP 검증 ==========

  const handleOtpVerify = useCallback(async () => {
    if (otp.length !== 6 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const challengeToken =
      sessionStorage.getItem(CHILD_PIN_CHALLENGE_KEY) ?? "";
    const body: ChildOtpVerifyDto = { childEmail: email, otp, challengeToken };
    const response = await api.post<LoginResponse>(
      "/child-auth/verify-otp-and-login",
      body,
    );

    if (
      response.success &&
      response.data?.accessToken &&
      response.data?.refreshToken
    ) {
      sessionStorage.removeItem(CHILD_PIN_CHALLENGE_KEY);
      sessionStorage.removeItem(CHILD_PIN_OTP_SENT_AT_KEY);
      await saveAuthTokens(
        response.data.accessToken,
        response.data.refreshToken,
      );
      await refreshUser();
      navigateToDashboard();
    } else {
      setOtp("");
      setError(mapErrorMessage(response.error?.code, response.error?.message));
      handleChallengeTokenError(response.error?.code);
    }
    setIsSubmitting(false);
  }, [
    otp,
    email,
    isSubmitting,
    navigateToDashboard,
    refreshUser,
    handleChallengeTokenError,
  ]);

  // ========== OTP 재발송 ==========

  const handleResendOtp = useCallback(async () => {
    if (countdown.isActive || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setIsReusedOtp(false);
    await sendOtp();
    setIsSubmitting(false);
  }, [countdown, isSubmitting, sendOtp]);

  // 인증 전에는 빈 화면 반환 (PIN UI 절대 노출 차단)
  if (!authChecked) {
    return <div className="min-h-screen-safe bg-wbg dark:bg-rink-900" />;
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <div
        ref={formContainerRef}
        className="min-h-screen-safe bg-wbg dark:bg-rink-900 flex flex-col scroll-keyboard-safe overflow-y-auto"
      >
        <div className="flex-1 flex flex-col px-6 pt-8 pb-keyboard-safe-8 max-w-md mx-auto w-full">
          {/* 뒤로가기 */}
          <div className="mb-6">
            <NavLink
              href="/login"
              className="inline-flex items-center gap-1 text-wtext-3 dark:text-rink-300 text-card-body font-medium"
            >
              <Icon name="arrow_back" className="text-card-emphasis" />
              {MESSAGES.common.goBack}
            </NavLink>
          </div>

          {/* 헤더 */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-ice-500 rounded-3xl flex items-center justify-center mb-4 shadow-md">
              <Icon
                name="lock"
                className="text-white text-4xl"
                aria-hidden="true"
              />
            </div>
            <h1 className="text-xl font-bold text-wtext-1 dark:text-white text-center">
              {CHILD_PIN_MESSAGES.required}
            </h1>
          </div>

          {/* 카드 */}
          <div className="bg-white dark:bg-rink-800 rounded-2xl py-6 px-3 sm:px-6 shadow-sm border border-wline-2 dark:border-rink-700">
            {/* 에러 메시지 */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    name="error"
                    className="text-red-500 text-card-title"
                    aria-hidden="true"
                  />
                  <p className="text-red-600 dark:text-red-400 text-card-body">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* ===== mode=fixed: 고정 PIN 입력 ===== */}
            {mode === "fixed" && (
              <div className="space-y-6">
                <p className="text-card-body text-wtext-2 dark:text-rink-100 text-center">
                  {CHILD_PIN_MESSAGES.enterPin}
                </p>

                <PinInput
                  value={pin}
                  onChange={setPin}
                  onComplete={() => {}}
                  childMode
                  disabled={isSubmitting}
                  error={undefined}
                />

                <button
                  type="button"
                  onClick={handleFixedPinSubmit}
                  disabled={pin.length !== 6 || isSubmitting}
                  className="w-full min-h-[72px] rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-bold text-card-title transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Icon
                        name="progress_activity"
                        className="animate-spin text-xl motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      {CHILD_PIN_MESSAGES.verifying}
                    </span>
                  ) : (
                    CHILD_PIN_MESSAGES.verify
                  )}
                </button>

                {/* PIN 분실 안내 */}
                <div className="text-center pt-2">
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                    {CHILD_PIN_MESSAGES.forgotPin}
                  </p>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-1">
                    {CHILD_PIN_MESSAGES.askParent}
                  </p>
                </div>
              </div>
            )}

            {/* ===== mode=otp: 자동 발송 중 / OTP 입력 ===== */}
            {mode === "otp" && initializing && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Icon
                  name="progress_activity"
                  className="animate-spin text-ice-500 text-3xl motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <p className="text-card-body text-wtext-3 dark:text-rink-300">
                  보호자에게 인증번호를 전송하고 있습니다...
                </p>
              </div>
            )}

            {mode === "otp" && !initializing && (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-card-body text-wtext-2 dark:text-rink-100">
                    {CHILD_PIN_MESSAGES.enterOtp}
                  </p>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-2">
                    {isReusedOtp ? (
                      <>
                        {CHILD_PIN_MESSAGES.otpAlreadySent}
                        <br />
                        {CHILD_PIN_MESSAGES.otpRemainingTime(
                          Math.floor(countdown.seconds / 60),
                          countdown.seconds % 60,
                        )}
                      </>
                    ) : (
                      CHILD_PIN_MESSAGES.otpSent
                    )}
                  </p>
                </div>

                <PinInput
                  value={otp}
                  onChange={setOtp}
                  onComplete={() => {}}
                  childMode
                  secure={false}
                  disabled={isSubmitting}
                  error={undefined}
                />

                <button
                  type="button"
                  onClick={handleOtpVerify}
                  disabled={otp.length !== 6 || isSubmitting}
                  className="w-full min-h-[72px] rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-bold text-card-title transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Icon
                        name="progress_activity"
                        className="animate-spin text-xl motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      {CHILD_PIN_MESSAGES.verifying}
                    </span>
                  ) : (
                    CHILD_PIN_MESSAGES.verify
                  )}
                </button>

                {/* 재발송 */}
                <div className="text-center">
                  {countdown.isActive ? (
                    <p className="text-card-body text-wtext-3 dark:text-rink-300">
                      {countdown.seconds}초 후 재발송 가능
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isSubmitting}
                      className="text-card-body font-medium text-ice-500 hover:text-ice-700 transition-colors motion-reduce:transition-none disabled:opacity-50"
                    >
                      {CHILD_PIN_MESSAGES.resend}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileContainer>
  );
}
