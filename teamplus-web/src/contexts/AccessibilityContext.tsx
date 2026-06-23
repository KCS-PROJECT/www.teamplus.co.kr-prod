"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

/**
 * AccessibilityContext — Task #51 D-9 Web 접근성 설정
 *
 * 사용자가 조절 가능한 4가지 접근성 옵션을 관리하고,
 * <html> 루트에 CSS 변수/클래스를 적용하여 전역에 반영합니다.
 *
 * 영속성: `localStorage['teamplus_a11y']`
 * 적용 대상:
 *   - `--a11y-font-scale` CSS 변수: body font-size 스케일
 *   - `.a11y-high-contrast`: 대비 강화 유틸리티 클래스
 *   - `.a11y-reduced-motion`: 애니메이션 최소화 (prefers-reduced-motion 보조)
 *   - `.a11y-sr-hints`: focus 시 aria-label 시각적 힌트 노출
 */

export type FontScale = 1 | 1.125 | 1.25 | 1.5;

export interface AccessibilitySettings {
  fontScale: FontScale;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderHints: boolean;
}

export const DEFAULT_A11Y_SETTINGS: AccessibilitySettings = {
  fontScale: 1,
  highContrast: false,
  reducedMotion: false,
  screenReaderHints: false,
};

const STORAGE_KEY = "teamplus_a11y";

interface AccessibilityContextValue extends AccessibilitySettings {
  setFontScale: (scale: FontScale) => void;
  setHighContrast: (on: boolean) => void;
  setReducedMotion: (on: boolean) => void;
  setScreenReaderHints: (on: boolean) => void;
  reset: () => void;
  mounted: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  ...DEFAULT_A11Y_SETTINGS,
  setFontScale: () => {},
  setHighContrast: () => {},
  setReducedMotion: () => {},
  setScreenReaderHints: () => {},
  reset: () => {},
  mounted: false,
});

function readFromStorage(): AccessibilitySettings {
  if (typeof window === "undefined") return DEFAULT_A11Y_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
    const scale = parsed.fontScale;
    const safeScale: FontScale =
      scale === 1 || scale === 1.125 || scale === 1.25 || scale === 1.5
        ? scale
        : 1;
    return {
      fontScale: safeScale,
      highContrast: !!parsed.highContrast,
      reducedMotion: !!parsed.reducedMotion,
      screenReaderHints: !!parsed.screenReaderHints,
    };
  } catch {
    return DEFAULT_A11Y_SETTINGS;
  }
}

function applyToDocument(settings: AccessibilitySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--a11y-font-scale", String(settings.fontScale));
  root.classList.toggle("a11y-high-contrast", settings.highContrast);
  root.classList.toggle("a11y-reduced-motion", settings.reducedMotion);
  root.classList.toggle("a11y-sr-hints", settings.screenReaderHints);
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(
    DEFAULT_A11Y_SETTINGS,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = readFromStorage();
    setSettings(initial);
    applyToDocument(initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyToDocument(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // 저장 실패는 무시 (시크릿 모드 등)
    }
  }, [settings, mounted]);

  const setFontScale = useCallback((scale: FontScale) => {
    setSettings((prev) => ({ ...prev, fontScale: scale }));
  }, []);
  const setHighContrast = useCallback((on: boolean) => {
    setSettings((prev) => ({ ...prev, highContrast: on }));
  }, []);
  const setReducedMotion = useCallback((on: boolean) => {
    setSettings((prev) => ({ ...prev, reducedMotion: on }));
  }, []);
  const setScreenReaderHints = useCallback((on: boolean) => {
    setSettings((prev) => ({ ...prev, screenReaderHints: on }));
  }, []);
  const reset = useCallback(() => {
    setSettings(DEFAULT_A11Y_SETTINGS);
  }, []);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      ...settings,
      setFontScale,
      setHighContrast,
      setReducedMotion,
      setScreenReaderHints,
      reset,
      mounted,
    }),
    [
      settings,
      setFontScale,
      setHighContrast,
      setReducedMotion,
      setScreenReaderHints,
      reset,
      mounted,
    ],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}
