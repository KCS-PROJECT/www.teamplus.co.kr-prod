"use client";

/**
 * CookieConsentBanner (T-12 — 2026-05-21 신규)
 *
 * GDPR · ePrivacy Directive 대비 쿠키 동의 배너.
 *
 * 정책:
 *  - 첫 진입 시 1회 노출 (localStorage `teamplus_cookie_consent` 기록 시 비표시)
 *  - 3-옵션: ① 전체 동의 ② 필수만 ③ 선택 동의 (모달)
 *  - 동의 카테고리: necessary(강제) · analytics · marketing
 *  - 동의 결과는 `window.dispatchEvent('teamplus:cookie-consent')` 로 broadcast
 *    → T-13 GA4 hook 이 이 이벤트로 조건부 초기화
 *
 * 디자인:
 *  - DESIGN.md 절대 규칙 준수 — gradient/blur/colored-shadow 0
 *  - 인디고 #2f5fff CTA · wbg #f6f8fc 배경 · wline-2 보더
 *  - 모바일 우선 (fixed bottom-0)
 *  - WCAG: 44x44 터치 타겟 + 7:1 대비 + role="dialog" aria-modal
 *
 * 사용:
 *  - layout.tsx 하단에 `<CookieConsentBanner />` 한 번만 마운트
 *  - 어디서나 `getCookieConsent()` 로 현재 상태 조회 가능
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isNativeApp } from "@/lib/environment";

const STORAGE_KEY = "teamplus_cookie_consent";
const CONSENT_VERSION = "1";
const CONSENT_EVENT = "teamplus:cookie-consent";

export type CookieCategory = "necessary" | "analytics" | "marketing";

export interface CookieConsent {
  version: string;
  acceptedAt: string;
  categories: Record<CookieCategory, boolean>;
}

/** 외부에서 현재 동의 상태 조회 — SSR 안전 */
export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 특정 카테고리 동의 여부 — analytics/marketing 활성화 가드용 */
export function hasCookieConsent(category: CookieCategory): boolean {
  const c = getCookieConsent();
  return c?.categories?.[category] === true;
}

function saveConsent(categories: Record<CookieCategory, boolean>): void {
  const consent: CookieConsent = {
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    categories: { ...categories, necessary: true },
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    window.dispatchEvent(
      new CustomEvent(CONSENT_EVENT, { detail: consent }),
    );
  } catch {
    // localStorage 차단 환경 — 세션 한정 동작 (배너 다시 안 뜸)
  }
}

export function CookieConsentBanner() {
  const [show, setShow] = useState(false);
  const [openCustomize, setOpenCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // 앱(Flutter WebView)에서는 배너 미노출 + 자동 "필수만 동의" 저장.
    // Apple App Store 5.1.4 / COPPA / PIPA §22조의2 — 앱은 OS 권한 + 스토어 정책으로 동의 수행.
    // 결과: GoogleAnalytics 의 hasCookieConsent('analytics') 가드가 false → GA 자동 차단.
    if (isNativeApp()) {
      if (!getCookieConsent()) {
        saveConsent({ necessary: true, analytics: false, marketing: false });
      }
      return;
    }

    // 웹 브라우저(GDPR/ePrivacy 대상) — 기존 동작 유지
    if (!getCookieConsent()) {
      setShow(true);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    saveConsent({ necessary: true, analytics: true, marketing: true });
    setShow(false);
  }, []);

  const handleNecessaryOnly = useCallback(() => {
    saveConsent({ necessary: true, analytics: false, marketing: false });
    setShow(false);
  }, []);

  const handleSaveSelection = useCallback(() => {
    saveConsent({ necessary: true, analytics, marketing });
    setShow(false);
    setOpenCustomize(false);
  }, [analytics, marketing]);

  if (!show) return null;

  return (
    <>
      {/* 메인 배너 — 모바일 fixed bottom */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="cookie-consent-title"
        className="fixed inset-x-0 bottom-0 z-[9000] border-t border-wline-2 bg-white text-w-body shadow-sh-2 dark:border-rink-700 dark:bg-rink-800 dark:text-white"
      >
        <div className="mx-auto max-w-[768px] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3">
            <div>
              <h2
                id="cookie-consent-title"
                className="text-w-body font-bold text-wtext-1 dark:text-white"
              >
                쿠키 사용 동의
              </h2>
              <p className="mt-1 text-w-small text-wtext-3 dark:text-rink-300">
                TEAMPLUS 는 서비스 운영에 필수적인 쿠키와, 사용성 개선·통계를
                위한 선택적 쿠키를 사용합니다.{" "}
                <Link
                  href="/terms"
                  className="text-ice-500 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
                >
                  자세히 보기
                </Link>
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <button
                type="button"
                onClick={handleAcceptAll}
                className="inline-flex h-12 min-h-[44px] flex-1 items-center justify-center rounded-w-md bg-ice-500 px-4 text-w-small font-bold text-white transition-colors hover:bg-ice-700 active:brightness-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/60"
              >
                전체 동의
              </button>
              <button
                type="button"
                onClick={handleNecessaryOnly}
                className="inline-flex h-12 min-h-[44px] flex-1 items-center justify-center rounded-w-md border border-wline-2 bg-white px-4 text-w-small font-bold text-wtext-1 transition-colors hover:border-ice-500/30 hover:bg-wbg active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:hover:border-ice-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/60"
              >
                필수만 허용
              </button>
              <button
                type="button"
                onClick={() => setOpenCustomize(true)}
                className="inline-flex h-12 min-h-[44px] items-center justify-center rounded-w-md border border-wline-2 bg-white px-4 text-w-small text-wtext-2 transition-colors hover:border-ice-500/30 hover:bg-wbg active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800 dark:text-rink-200 dark:hover:border-ice-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/60"
              >
                선택 동의
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 선택 동의 모달 */}
      {openCustomize ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-customize-title"
          className="fixed inset-0 z-[9100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-[480px] rounded-t-w-xl bg-white shadow-sh-3 dark:bg-rink-800 sm:rounded-w-xl">
            <div className="border-b border-wline-2 px-5 py-4 dark:border-rink-700">
              <h3
                id="cookie-customize-title"
                className="text-w-h3 font-bold text-wtext-1 dark:text-white"
              >
                쿠키 카테고리 선택
              </h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <CategoryRow
                label="필수 쿠키"
                description="로그인 유지·보안 등 서비스 운영에 필수적인 쿠키 (비활성화 불가)"
                checked
                disabled
              />
              <CategoryRow
                label="분석 쿠키"
                description="페이지 사용 통계·성능 측정용 (Google Analytics 4)"
                checked={analytics}
                onChange={setAnalytics}
              />
              <CategoryRow
                label="마케팅 쿠키"
                description="맞춤형 광고·캠페인 효과 측정 (현재 미사용)"
                checked={marketing}
                onChange={setMarketing}
              />
            </div>
            <div className="flex flex-col gap-2 border-t border-wline-2 px-5 py-4 dark:border-rink-700 sm:flex-row">
              <button
                type="button"
                onClick={() => setOpenCustomize(false)}
                className="inline-flex h-12 min-h-[44px] flex-1 items-center justify-center rounded-w-md border border-wline-2 bg-white px-4 text-w-small font-bold text-wtext-1 transition-colors hover:bg-wbg active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveSelection}
                className="inline-flex h-12 min-h-[44px] flex-1 items-center justify-center rounded-w-md bg-ice-500 px-4 text-w-small font-bold text-white transition-colors hover:bg-ice-700 active:brightness-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/60"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface CategoryRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}

function CategoryRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: CategoryRowProps) {
  return (
    <label className="flex items-start gap-3 rounded-w-md border border-wline-2 p-3 dark:border-rink-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-5 w-5 rounded border-wline-2 text-ice-500 focus:ring-2 focus:ring-ice-500/60 disabled:opacity-50"
      />
      <span className="flex-1 text-left">
        <span className="block text-w-small font-bold text-wtext-1 dark:text-white">
          {label}
        </span>
        <span className="mt-0.5 block text-w-caption text-wtext-3 dark:text-rink-300">
          {description}
        </span>
      </span>
    </label>
  );
}
