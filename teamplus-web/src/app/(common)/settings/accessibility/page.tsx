"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { usePageReady } from "@/hooks/usePageReady";
import {
  useAccessibility,
  type FontScale,
  DEFAULT_A11Y_SETTINGS,
} from "@/contexts/AccessibilityContext";

/**
 * Task #51 D-9 접근성 설정 Web
 * Route: /settings/accessibility
 *
 * 기능
 *   - 글자 크기: 작게 / 기본 / 크게 / 매우 크게 (scale 0.875~1.5)
 *   - 고대비 모드: 테두리·글자 대비 강화
 *   - 애니메이션 감소: 기기 설정을 강제 적용 (prefers-reduced-motion 보조)
 *   - 스크린 리더 힌트: 포커스된 요소의 aria-label 시각적 노출
 *
 * 영속화: localStorage['teamplus_a11y'] (AccessibilityContext)
 * 전역 적용: <html>에 --a11y-font-scale 변수 · a11y-* 클래스
 */

// 4단계 사이즈: 1(기본) / 1.125(크게) / 1.25(매우 크게) / 1.5(최대)
const SIZE_LABELS: Array<{ value: FontScale; label: string }> = [
  { value: 1, label: MESSAGES.accessibility.fontSizeNormal },
  { value: 1.125, label: MESSAGES.accessibility.fontSizeLarge },
  { value: 1.25, label: MESSAGES.accessibility.fontSizeExtraLarge },
  { value: 1.5, label: "최대" },
];

export default function AccessibilitySettingsPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { toast } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const {
    fontScale,
    highContrast,
    reducedMotion,
    screenReaderHints,
    setFontScale,
    setHighContrast,
    setReducedMotion,
    setScreenReaderHints,
    reset,
    mounted,
  } = useAccessibility();

  // 네이티브 AppBar 끄고 공통 컴포넌트 PageAppBar(forceNative) 사용
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    reset();
    setConfirmReset(false);
    toast.success(MESSAGES.accessibility.resetSuccess);
  };

  const isDefault =
    fontScale === DEFAULT_A11Y_SETTINGS.fontScale &&
    highContrast === DEFAULT_A11Y_SETTINGS.highContrast &&
    reducedMotion === DEFAULT_A11Y_SETTINGS.reducedMotion &&
    screenReaderHints === DEFAULT_A11Y_SETTINGS.screenReaderHints;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={MESSAGES.accessibility.pageTitle}
        showBack
        forceNative
      />

      {/* Content — ICETIMES flat: 회색 캔버스 + full-bleed 흰 섹션 */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {/* 안내문 — 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 py-4">
          <p className="text-w-small text-it-ink-500 dark:text-rink-200 leading-relaxed">
            {MESSAGES.accessibility.pageDescription}
          </p>
        </section>

        {/* 글자 크기 — flat 흰 섹션 (카드 박스 제거) */}
        <section
          className="bg-it-surface dark:bg-rink-800 mt-2"
          aria-labelledby="a11y-font-size-title"
        >
          <div className="px-5 pt-5 pb-2">
            <h2
              id="a11y-font-size-title"
              className="text-w-body-lg font-bold text-it-ink-800 dark:text-white"
            >
              {MESSAGES.accessibility.fontSizeSection}
            </h2>
            <p className="text-w-caption text-it-ink-500 dark:text-rink-300 mt-1">
              {MESSAGES.accessibility.fontSizeDescription}
            </p>
          </div>

          <div className="px-5 pb-3">
            <div
              className="grid grid-cols-4 gap-2"
              role="radiogroup"
              aria-label={MESSAGES.accessibility.fontSizeSection}
            >
              {SIZE_LABELS.map((opt) => {
                const isSelected = mounted && fontScale === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setFontScale(opt.value)}
                    className={`h-14 rounded-w-md border-[1.5px] font-semibold transition-colors motion-reduce:transition-none ${
                      isSelected
                        ? "bg-it-blue-50 dark:bg-it-blue-900/20 border-it-blue-500 text-it-blue-500 dark:text-it-blue-300"
                        : "bg-it-fill dark:bg-rink-900 border-it-line-strong dark:border-rink-600 text-it-ink-500 dark:text-rink-200 hover:border-it-blue-500/40 dark:hover:border-rink-500"
                    }`}
                  >
                    <span
                      style={{ fontSize: `${opt.value}rem` }}
                      aria-hidden="true"
                      className="block leading-none"
                    >
                      가
                    </span>
                    <span className="block text-w-caption mt-0.5 font-medium">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-5 mb-5 p-3 rounded-w-md bg-it-fill dark:bg-rink-900 border border-it-line dark:border-rink-700">
            <p className="text-w-caption font-bold text-it-ink-400 dark:text-rink-400 uppercase mb-1">
              PREVIEW
            </p>
            <p className="text-it-ink-800 dark:text-rink-100 leading-relaxed">
              {MESSAGES.accessibility.fontSizePreview}
            </p>
          </div>
        </section>

        {/* 고대비 모드 */}
        <ToggleSection
          title={MESSAGES.accessibility.highContrastSection}
          description={MESSAGES.accessibility.highContrastDescription}
          icon="contrast"
          onLabel={MESSAGES.accessibility.highContrastOn}
          offLabel={MESSAGES.accessibility.highContrastOff}
          checked={mounted && highContrast}
          onChange={setHighContrast}
        />

        {/* 애니메이션 감소 */}
        <ToggleSection
          title={MESSAGES.accessibility.reducedMotionSection}
          description={MESSAGES.accessibility.reducedMotionDescription}
          icon="motion_photos_off"
          onLabel={MESSAGES.accessibility.reducedMotionOn}
          offLabel={MESSAGES.accessibility.reducedMotionOff}
          checked={mounted && reducedMotion}
          onChange={setReducedMotion}
          footNote={MESSAGES.accessibility.reducedMotionSystemNote}
        />

        {/* 스크린 리더 힌트 */}
        <ToggleSection
          title={MESSAGES.accessibility.screenReaderHintsSection}
          description={MESSAGES.accessibility.screenReaderHintsDescription}
          icon="record_voice_over"
          onLabel={MESSAGES.accessibility.screenReaderHintsOn}
          offLabel={MESSAGES.accessibility.screenReaderHintsOff}
          checked={mounted && screenReaderHints}
          onChange={setScreenReaderHints}
        />

        {/* 도움말 — 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 py-4">
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-w-md bg-it-fill dark:bg-rink-900 border border-it-line dark:border-rink-700">
            <Icon
              name="info"
              className="text-it-ink-400 dark:text-rink-400 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-w-caption text-it-ink-500 dark:text-rink-300 leading-relaxed">
              {MESSAGES.accessibility.tip}
            </p>
          </div>
        </section>

        {/* 기본값으로 되돌리기 */}
        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={isDefault}
            className={`w-full h-[54px] rounded-w-md font-extrabold text-[16px] tracking-[-0.01em] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 ${
              isDefault
                ? "bg-it-surface dark:bg-rink-800 text-it-ink-400 dark:text-rink-400 cursor-not-allowed border-[1.5px] border-it-line-strong dark:border-rink-700 focus-visible:ring-it-line-strong"
                : confirmReset
                  ? "bg-it-red-500 text-white hover:bg-it-red-600 focus-visible:ring-it-red-500/40"
                  : "bg-it-surface dark:bg-rink-800 text-it-ink-800 dark:text-rink-200 border-[1.5px] border-it-line-strong dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-700/40 focus-visible:ring-it-line-strong"
            }`}
            aria-label={
              confirmReset
                ? MESSAGES.accessibility.resetConfirm
                : MESSAGES.accessibility.resetAll
            }
          >
            {confirmReset
              ? MESSAGES.accessibility.resetConfirm
              : MESSAGES.accessibility.resetAll}
          </button>
          {confirmReset && !isDefault && (
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="w-full mt-2 h-10 rounded-w-md text-w-small text-it-ink-500 dark:text-rink-300 hover:text-it-ink-800 dark:hover:text-rink-200"
            >
              {MESSAGES.common.cancel}
            </button>
          )}
        </div>
      </main>
    </MobileContainer>
  );
}

// ─── 내부 Toggle 섹션 컴포넌트 ─────────────────────────────

interface ToggleSectionProps {
  title: string;
  description: string;
  icon: string;
  onLabel: string;
  offLabel: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  footNote?: string;
}

function ToggleSection({
  title,
  description,
  icon,
  onLabel,
  offLabel,
  checked,
  onChange,
  footNote,
}: ToggleSectionProps) {
  return (
    <section
      className="bg-it-surface dark:bg-rink-800 mt-2"
      aria-labelledby={`a11y-${icon}-title`}
    >
      <div className="flex items-start gap-3 px-5 py-4">
        <div
          className={`w-10 h-10 shrink-0 rounded-w-md flex items-center justify-center ${
            checked
              ? "bg-it-blue-500 text-white"
              : "bg-it-fill dark:bg-rink-900 text-it-ink-400 dark:text-rink-300"
          }`}
        >
          <Icon name={icon} className="text-xl" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2
            id={`a11y-${icon}-title`}
            className="text-w-body-lg font-bold text-it-ink-800 dark:text-white"
          >
            {title}
          </h2>
          <p className="text-w-caption text-it-ink-500 dark:text-rink-300 mt-1 leading-relaxed">
            {description}
          </p>
        </div>

        {/* 토글 스위치 */}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${title}: ${checked ? onLabel : offLabel}`}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-w-pill transition-colors motion-reduce:transition-none ${
            checked ? "bg-it-blue-500" : "bg-it-line-strong dark:bg-rink-600"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-w-pill bg-white shadow transition-transform motion-reduce:transition-none ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {footNote && (
        <div className="px-5 pb-4">
          <p className="text-w-caption text-it-ink-400 dark:text-rink-400 leading-relaxed">
            {footNote}
          </p>
        </div>
      )}
    </section>
  );
}
