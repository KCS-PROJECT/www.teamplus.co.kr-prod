"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigation } from "@/components/ui/NavLink";
import { EventPopup } from "@/components/ui/EventPopup";
import { apiRequest } from "@/services/api-client";
import { useNativeScrim } from "@/hooks/useNativeScrim";

// ─── Types ───────────────────────────────────────────────
interface AppBanner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  linkType?: string | null;
  targetRole?: string | null;
  sortOrder?: number;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
  displayLocations?: string[];
  displayLocationsJson?: string;
  description?: string;
}

// ─── 상수 ────────────────────────────────────────────────
const HIDE_STORAGE_KEY_PREFIX = "teamplus:event-popup:hide";
const HIDDEN_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/find-id",
  "/find-password",
  "/splash",
  "/onboarding",
  "/terms",
  "/faq",
];

// ─── 유틸리티 ────────────────────────────────────────────
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** "오늘 하루 보지 않기" 키를 localStorage에 날짜 기반으로 저장 */
function setHideTodayFlag(bannerId: string) {
  if (typeof window === "undefined") return;
  const today = getTodayKey();
  const key = `${HIDE_STORAGE_KEY_PREFIX}:${today}`;
  try {
    const raw = localStorage.getItem(key);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(bannerId)) {
      ids.push(bannerId);
    }
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    localStorage.setItem(key, JSON.stringify([bannerId]));
  }
}

/** 오늘 숨김 처리된 배너인지 확인 */
function isHiddenToday(bannerId: string): boolean {
  if (typeof window === "undefined") return false;
  const today = getTodayKey();
  const key = `${HIDE_STORAGE_KEY_PREFIX}:${today}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const ids: string[] = JSON.parse(raw);
    return ids.includes(bannerId);
  } catch {
    return false;
  }
}

function isTargetRoleMatch(
  targetRole: string | null | undefined,
  userType: string,
) {
  if (!targetRole || targetRole.toLowerCase() === "all") {
    return true;
  }
  if (["home", "popup", "mypage"].includes(targetRole.toLowerCase())) {
    return true;
  }
  return targetRole.toUpperCase() === userType.toUpperCase();
}

function isBannerInActiveRange(banner: AppBanner) {
  const now = new Date();
  if (banner.startAt) {
    const start = new Date(banner.startAt);
    if (!Number.isNaN(start.getTime()) && now < start) {
      return false;
    }
  }
  if (banner.endAt) {
    const end = new Date(banner.endAt);
    if (!Number.isNaN(end.getTime()) && now > end) {
      return false;
    }
  }
  return true;
}

// ─── GlobalEventPopup Component ──────────────────────────
export function GlobalEventPopup() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { navigate } = useNavigation();
  const pathname = usePathname();

  const [bannerQueue, setBannerQueue] = useState<AppBanner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const currentBanner = bannerQueue[currentIndex] ?? null;

  // [2026-05-16] 네이티브 safe-area(상단 status bar / 하단 home indicator) 까지
  //   dim 처리 — Modal 표준 #8C141826 (rink-900/55). 내부 EventPopup 도 동일 컬러로
  //   호출하지만 SPEC §3.2 명시에 따라 wrapping 컴포넌트에서도 명시적으로 적용한다.
  //   (동일 컬러 idempotent — Flutter setConfig 는 마지막 호출이 유효)
  //   SoT: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md §2.4 / §3.2
  useNativeScrim(isOpen && currentBanner !== null, "#8C141826");

  const shouldHideByPath = useMemo(
    () => HIDDEN_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix)),
    [pathname],
  );

  const loadActiveBanner = useCallback(async () => {
    if (!isAuthenticated || !user || shouldHideByPath) {
      setBannerQueue([]);
      setCurrentIndex(0);
      setIsOpen(false);
      return;
    }

    try {
      const res = await apiRequest<AppBanner[]>({
        method: "GET",
        url: "/app/banners?isActive=true",
        retry: false,
      });

      if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
        setBannerQueue([]);
        setIsOpen(false);
        return;
      }

      const activeBanners = res.data
        .filter((item) => item.isActive)
        .filter(isBannerInActiveRange)
        .filter((item) => isTargetRoleMatch(item.targetRole, user.userType))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .filter((item) => !isHiddenToday(item.id));

      if (activeBanners.length === 0) {
        setBannerQueue([]);
        setIsOpen(false);
        return;
      }

      setBannerQueue(activeBanners);
      setCurrentIndex(0);
      setIsOpen(true);
    } catch {
      setBannerQueue([]);
      setIsOpen(false);
    }
  }, [isAuthenticated, shouldHideByPath, user]);

  useEffect(() => {
    if (isLoading || typeof window === "undefined") return;
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    const run = () => {
      void loadActiveBanner();
    };
    if (w.requestIdleCallback) {
      w.requestIdleCallback(run, { timeout: 1500 });
      return;
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [isLoading, loadActiveBanner]);

  // 다음 배너로 전환 또는 닫기
  const showNextBanner = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < bannerQueue.length) {
      setIsOpen(false);
      setTimeout(() => {
        setCurrentIndex(nextIdx);
        setIsOpen(true);
      }, 400);
    } else {
      setIsOpen(false);
    }
  }, [currentIndex, bannerQueue.length]);

  const handleDismiss = useCallback(() => {
    showNextBanner();
  }, [showNextBanner]);

  const handleHideToday = useCallback(() => {
    if (currentBanner) {
      setHideTodayFlag(currentBanner.id);
    }
    showNextBanner();
  }, [currentBanner, showNextBanner]);

  const handleCtaClick = useCallback(() => {
    if (!currentBanner?.linkUrl) {
      showNextBanner();
      return;
    }

    if (currentBanner.linkType === "external") {
      window.open(currentBanner.linkUrl, "_blank", "noopener,noreferrer");
    } else {
      navigate(currentBanner.linkUrl);
    }
    showNextBanner();
  }, [currentBanner, navigate, showNextBanner]);

  if (!currentBanner) return null;

  return (
    <EventPopup
      open={isOpen}
      title={currentBanner.title}
      description={
        currentBanner.description || "진행 중인 이벤트를 확인해보세요."
      }
      ctaLabel={currentBanner.linkUrl ? "상세보기" : "확인하기"}
      onCtaClick={handleCtaClick}
      onDismiss={handleDismiss}
      onHideToday={handleHideToday}
      iconType="gift"
    />
  );
}

export default GlobalEventPopup;
