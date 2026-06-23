"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { isNativeApp } from "@/lib/environment";

// 외부 호환을 위해 유니언 타입은 유지하되, 내부적으로는 항상 'light' 로 강제됩니다.
type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const defaultContext: ThemeContextType = {
  theme: "light",
  setTheme: () => {},
  mounted: false,
};

const ThemeContext = createContext<ThemeContextType>(defaultContext);

async function syncThemeToNative(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!window.flutter_inappwebview) return;
    await window.flutter_inappwebview.callHandler("theme", {
      action: "setTheme",
      mode: "light",
    });
  } catch {
    // 네이티브 브릿지 미연결 시 무시
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // 라이트 모드 단일 강제: 기존 dark/system 잔재(localStorage·cookie·html class) 즉시 청소
    try {
      localStorage.setItem("theme", "light");
    } catch {
      // localStorage 접근 불가 환경 무시
    }

    const root = window.document.documentElement;
    root.classList.remove("dark");
    if (!root.classList.contains("light")) root.classList.add("light");

    root.style.removeProperty("background");
    if (document.body) {
      document.body.style.removeProperty("background");
      document.body.style.removeProperty("color");
    }

    const themeColor = "#f8fafc";
    let meta = document.querySelector(
      'meta[name="theme-color"]',
    ) as HTMLMetaElement | null;
    if (meta) {
      meta.setAttribute("content", themeColor);
    } else {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = themeColor;
      document.head.appendChild(meta);
    }

    document.cookie = "theme=light;path=/;max-age=31536000;SameSite=Lax";

    if (isNativeApp()) {
      syncThemeToNative();
    }
  }, []);

  // Flutter → Web 브릿지 호환: 어떤 mode가 들어와도 light 유지
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;

    (window as unknown as Record<string, unknown>).__teamplus_SET_THEME__ =
      () => {
        const root = window.document.documentElement;
        root.classList.remove("dark");
        if (!root.classList.contains("light")) root.classList.add("light");
      };

    return () => {
      delete (window as unknown as Record<string, unknown>)
        .__teamplus_SET_THEME__;
    };
  }, [mounted]);

  const setTheme = useCallback((_next: Theme) => {
    // 라이트 모드 단일 강제 — 호출 인자는 무시
    void _next;
  }, []);

  const value: ThemeContextType = {
    theme: "light",
    setTheme,
    mounted,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  return context;
}
