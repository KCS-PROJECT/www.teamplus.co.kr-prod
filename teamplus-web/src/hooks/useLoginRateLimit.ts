/**
 * Login Rate Limiting Hook
 *
 * 로그인 실패 시 점진적 잠금을 구현합니다.
 * - 5회 실패 후 30초 잠금
 * - 이후 실패마다 잠금 시간 2배 증가 (최대 15분)
 * - 성공 시 카운터 초기화
 */

import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "teamplus_login_rate_limit";
const MAX_ATTEMPTS = 5;
const INITIAL_LOCKOUT_SECONDS = 30;
const MAX_LOCKOUT_SECONDS = 15 * 60; // 15분

// [2026-05-14] 개발 환경에서는 rate limit 완전 비활성화 — 시뮬레이터 반복 로그인 테스트 차단 방지.
//   production 빌드(NODE_ENV=production)에서는 정상 동작. dev/test 환경에서만 우회.
const IS_DEV_BYPASS =
  typeof process !== "undefined" && process.env.NODE_ENV !== "production";

interface RateLimitState {
  failedAttempts: number;
  lockoutUntil: number | null;
  consecutiveLockouts: number;
}

interface UseLoginRateLimitResult {
  /** 현재 잠금 상태인지 여부 */
  isLocked: boolean;
  /** 남은 잠금 시간 (초) */
  remainingLockoutTime: number;
  /** 남은 시도 횟수 */
  remainingAttempts: number;
  /** 로그인 실패 시 호출 */
  onLoginFailed: () => void;
  /** 로그인 성공 시 호출 (카운터 초기화) */
  onLoginSuccess: () => void;
  /** 잠금 상태 에러 메시지 */
  lockoutMessage: string | null;
}

/**
 * localStorage에서 상태 로드
 */
function loadState(): RateLimitState {
  if (typeof window === "undefined") {
    return { failedAttempts: 0, lockoutUntil: null, consecutiveLockouts: 0 };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as RateLimitState;
      // 만료된 잠금 상태 초기화
      if (state.lockoutUntil && Date.now() > state.lockoutUntil) {
        return { ...state, lockoutUntil: null };
      }
      return state;
    }
  } catch {
    // JSON 파싱 실패 시 초기 상태 반환
  }

  return { failedAttempts: 0, lockoutUntil: null, consecutiveLockouts: 0 };
}

/**
 * localStorage에 상태 저장
 */
function saveState(state: RateLimitState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 저장 실패 시 무시
  }
}

/**
 * 다음 잠금 시간 계산 (점진적 증가)
 */
function calculateLockoutDuration(consecutiveLockouts: number): number {
  const duration = INITIAL_LOCKOUT_SECONDS * Math.pow(2, consecutiveLockouts);
  return Math.min(duration, MAX_LOCKOUT_SECONDS);
}

/**
 * 시간을 포맷팅 (분:초)
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}분 ${secs}초`;
  }
  return `${secs}초`;
}

export function useLoginRateLimit(): UseLoginRateLimitResult {
  // Hydration 에러 방지: 서버와 클라이언트 모두 동일한 초기값 사용
  const [state, setState] = useState<RateLimitState>({
    failedAttempts: 0,
    lockoutUntil: null,
    consecutiveLockouts: 0,
  });
  const [remainingTime, setRemainingTime] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 클라이언트에서만 localStorage 상태 로드 (Hydration 이후)
  useEffect(() => {
    // [2026-05-14] dev 환경 — 기존 lockout localStorage 즉시 삭제 + 초기 상태 유지.
    if (IS_DEV_BYPASS) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
      setIsHydrated(true);
      return;
    }
    const loadedState = loadState();
    setState(loadedState);
    setIsHydrated(true);
  }, []);

  // 잠금 상태 계산 (Hydration 전에는 false 유지 · dev 환경에서는 영구 false)
  const isLocked =
    !IS_DEV_BYPASS &&
    isHydrated &&
    state.lockoutUntil !== null &&
    Date.now() < state.lockoutUntil;
  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - state.failedAttempts);

  // 잠금 시간 타이머 업데이트
  useEffect(() => {
    if (!isLocked || !state.lockoutUntil) {
      setRemainingTime(0);
      return;
    }

    const updateRemainingTime = () => {
      const remaining = Math.max(
        0,
        Math.ceil((state.lockoutUntil! - Date.now()) / 1000),
      );
      setRemainingTime(remaining);

      if (remaining <= 0) {
        // 잠금 해제
        setState((prev) => ({ ...prev, lockoutUntil: null }));
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    updateRemainingTime();
    timerRef.current = setInterval(updateRemainingTime, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLocked, state.lockoutUntil]);

  // 상태 변경 시 localStorage 저장
  useEffect(() => {
    saveState(state);
  }, [state]);

  // 로그인 실패 처리
  const onLoginFailed = useCallback(() => {
    // [2026-05-14] dev 환경 — 카운터 누적 자체를 무시.
    if (IS_DEV_BYPASS) return;
    setState((prev) => {
      const newAttempts = prev.failedAttempts + 1;

      // 최대 시도 횟수 초과 시 잠금
      if (newAttempts >= MAX_ATTEMPTS) {
        const lockoutDuration = calculateLockoutDuration(
          prev.consecutiveLockouts,
        );
        return {
          failedAttempts: 0, // 다음 잠금 해제 후 카운터 초기화
          lockoutUntil: Date.now() + lockoutDuration * 1000,
          consecutiveLockouts: prev.consecutiveLockouts + 1,
        };
      }

      return {
        ...prev,
        failedAttempts: newAttempts,
      };
    });
  }, []);

  // 로그인 성공 처리
  const onLoginSuccess = useCallback(() => {
    setState({
      failedAttempts: 0,
      lockoutUntil: null,
      consecutiveLockouts: 0,
    });
  }, []);

  // 잠금 메시지 생성 (Hydration 전에는 null 유지)
  const lockoutMessage = !isHydrated
    ? null
    : isLocked
      ? `로그인 시도 횟수를 초과했습니다. ${formatTime(remainingTime)} 후에 다시 시도해주세요.`
      : remainingAttempts <= 2 && remainingAttempts > 0
        ? `로그인 시도 가능 횟수: ${remainingAttempts}회`
        : null;

  return {
    isLocked,
    remainingLockoutTime: remainingTime,
    remainingAttempts,
    onLoginFailed,
    onLoginSuccess,
    lockoutMessage,
  };
}

export default useLoginRateLimit;
