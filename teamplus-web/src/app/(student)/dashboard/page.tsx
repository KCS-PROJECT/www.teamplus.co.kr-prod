"use client";

/**
 * 학생(아동/청소년 공용) 메인화면 — Wallet 4탭 (내 수업 / 내 등급 / 내 기록 / 부가)
 * 2026-04-29 신한pLay 월렛 풍 재구성. 기존 student API 호출 + useNativeUI 보존.
 *
 * ⚠️ 아동 UI(child) WCAG AAA: 글자 16px+, 명도 대비 7:1, 터치 영역 충분
 *    → 월렛 디자인 자체가 모바일 14~16px 본문, color/contrast 통과 → 추가 조정 불필요.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { usePageReady } from "@/hooks/usePageReady";
import { MESSAGES } from "@/lib/messages";
import { api } from "@/services/api-client";

import {
  WalletScreen,
  HeroPassCard,
  MembershipHeroCard,
  SectionHead,
  RecordCardPromo,
  MonthlyDuePill,
  ViewToggleAndChips,
  PaymentMethodList,
  AffiliateBenefitsGrid,
  AlertBanner,
  DocItem,
  DocStorageItem,
  QuickServicesGrid,
  MoreServicesList,
} from "@/components/wallet";

const GlobalMenu = dynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);

interface TodayClass {
  id: string;
  title: string;
  time: string;
  coach: string;
  location: string;
}

export default function StudentDashboardPage() {
  const { navigate } = useNavigation();
  const { user } = useSessionAuth();
  const { unreadCount } = useNotificationCount();

  const [todayClass, setTodayClass] = useState<TodayClass | null>(null);
  const [weeklyRate, setWeeklyRate] = useState(0);
  const [currentRank, setCurrentRank] = useState(0);
  const [recentBadges, setRecentBadges] = useState<
    { emoji: string; name: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 풀스크린 로더 fast-path (v11) — 데이터 fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!loading);

  const userType = (user as { userType?: string } | null)?.userType ?? "child";
  const isChild = userType === "child";

  const fetchData = useCallback(async () => {
    try {
      // 백엔드 통합 엔드포인트 1회 호출 (4개 /dashboard/student/* 404 → /dashboard/child-home 통합)
      // 2026-04-29 (3차 보강): rank/recentBadges 도 child-home 응답으로 통합
      const res = await api.get<{
        todayClass: {
          title: string;
          startTime: string;
          endTime: string;
          coach: string;
        } | null;
        weekRecords: { date: string; status: string }[];
        rank: number;
        recentBadges: { emoji: string; name: string }[];
      }>("/dashboard/child-home");

      if (res.success && res.data) {
        const d = res.data;
        setTodayClass(
          d.todayClass
            ? {
                id: "today",
                title: d.todayClass.title,
                time: `${d.todayClass.startTime}-${d.todayClass.endTime}`,
                coach: d.todayClass.coach,
                location: "",
              }
            : null,
        );

        const total = d.weekRecords?.length ?? 0;
        const present = (d.weekRecords ?? []).filter(
          (r) => r.status === "present" || r.status === "late",
        ).length;
        setWeeklyRate(total > 0 ? Math.round((present / total) * 100) : 0);

        setCurrentRank(d.rank ?? 0);
        setRecentBadges(d.recentBadges ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !loading,
    showBackButton: false,
    showMenuButton: false,
  });

  // 풀스크린 로더는 LoadingProvider 의 PageTransitionLoader (z-9999) 가 z-index 우선 적용으로
  // loading=true 동안 화면 전체를 덮으므로 자체 LoadingPuck 은 중복. usePageReady(!loading) 가
  // fast-path 로 데이터 도착 시점에 OFF 되므로 빈 페이지 노출 우려도 없음. (v11.3 이중 로더 제거)
  // v17 anti-flicker: return null → visibility:hidden wrapper 로 변경 (unmount→mount 깜박임 제거)

  const userName = user?.name || (isChild ? "나" : "나");

  // ─── B1 내 수업 ─────────────────────────
  const payTab = (
    <div className="flex flex-col">
      <RecordCardPromo
        customTitle="나의 빙판 다이어리 만들기"
        onStart={() => navigate("/badges")}
      />

      <ViewToggleAndChips
        chips={[
          { label: "출석 기록", onClick: () => navigate("/attendance") },
          {
            label: "내 일정",
            onClick: () => navigate(isChild ? "/schedule" : "/calendar"),
          },
        ]}
      />

      <MonthlyDuePill
        amount={weeklyRate}
        label="이번 주 출석률"
        score={`${currentRank}위`}
        unit="%"
        onClick={() => navigate("/attendance")}
      />

      <HeroPassCard
        title={todayClass?.title ?? "오늘 수업"}
        subtitle={`${userName} · ${todayClass?.coach ?? "담당 코치"}`}
        amountLabel="다음 수업"
        amount={
          todayClass
            ? Number(
                (todayClass.time || "").replace(/[^0-9]/g, "").slice(0, 2) || 0,
              )
            : 0
        }
        unit="시"
        actions={[
          {
            label: "내 일정",
            icon: <span className="text-white"><CalendarIcon /></span>,
            onClick: () => navigate(isChild ? "/schedule" : "/calendar"),
          },
          {
            label: "더보기",
            icon: <span className="text-white"><DotsIcon /></span>,
            onClick: () => navigate("/classes"),
          },
        ]}
        cardWatermark="STUDENT"
        onCardClick={() => navigate("/classes")}
      />

      <PaymentMethodList
        methods={[
          {
            name: "오늘 수업",
            sub: todayClass
              ? `${todayClass.time} · ${todayClass.location}`
              : "오늘 수업 없음",
            color: "var(--c-mint-100)",
            icon: "⏰",
            onClick: () => navigate("/classes"),
          },
          {
            name: "주간 출석",
            sub: `${weeklyRate}% 달성`,
            color: "var(--c-flame-100)",
            icon: "✓",
            onClick: () => navigate("/attendance"),
          },
        ]}
      />
    </div>
  );

  // ─── B2 내 등급(멤버십) ──────────────────
  const grade =
    currentRank <= 5 ? "GOLD" : currentRank <= 20 ? "SILVER" : "BRONZE";
  const gradeColor =
    grade === "GOLD"
      ? "var(--c-sun-500)"
      : grade === "SILVER"
        ? "var(--c-rink-300)"
        : "var(--c-flame-500)";
  const mshipTab = (
    <div className="flex flex-col">
      <MembershipHeroCard
        grade={grade}
        gradeColor={gradeColor}
        clubName={`전체 ${currentRank}위`}
        userName={`${userName} 선수`}
        memberInfo={`최근 뱃지 ${recentBadges.length}개 획득`}
        stats={[
          { label: "출석률", value: `${weeklyRate}%` },
          { label: "랭킹", value: `${currentRank}위` },
          { label: "뱃지", value: `${recentBadges.length}개` },
        ]}
      />

      <SectionHead
        title="내 뱃지"
        action="전체 ›"
        onActionClick={() => navigate("/badges")}
      />
      <div className="px-3 sm:px-5 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {recentBadges.slice(0, 4).map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => navigate("/badges")}
            className="bg-wsurface dark:bg-rink-800 rounded-2xl p-2 sm:p-3 flex flex-col items-center gap-1 border-0 active:brightness-95 min-w-0"
          >
            <span
              className="text-2xl sm:text-w-h2 leading-none"
              aria-hidden="true"
            >
              {b.emoji}
            </span>
            <span className="text-card-meta text-wtext-2 dark:text-rink-100 truncate w-full text-center">
              {b.name}
            </span>
          </button>
        ))}
        {recentBadges.length === 0 && (
          <div className="col-span-2 sm:col-span-4 text-center text-card-body text-wtext-3 py-4 break-keep">
            아직 뱃지가 없어요.
          </div>
        )}
      </div>

      <SectionHead title="제휴 혜택" action="전체 ›" />
      <AffiliateBenefitsGrid
        benefits={[
          { name: "장비 대여", off: "50%", color: "var(--c-flame-100)" },
          { name: "대회 등록", off: "20%", color: "var(--c-mint-100)" },
          { name: "영상 분석", off: "1회 무료", color: "var(--c-ice-100)" },
          { name: "주차권", off: "3시간", color: "var(--c-sun-100)" },
        ]}
      />
    </div>
  );

  // ─── B3 내 기록 ──────────────────────────
  const docTab = (
    <div className="flex flex-col">
      <AlertBanner
        body={
          <span className="break-keep">
            받은 기록{" "}
            <span
              className="font-extrabold tabular-nums"
              style={{ color: "var(--c-flame-500)" }}
            >
              {recentBadges.length}건
            </span>
            이 있어요
          </span>
        }
        onClick={() => navigate("/badges")}
      />
      <SectionHead title="최근 받음" />
      <div className="px-3 sm:px-5 flex flex-col gap-2">
        <DocItem
          title="이번 주 출석 증명서"
          from="팀플러스"
          deadlineLabel="발급 가능"
          onSign={() => navigate("/attendance")}
        />
        <DocItem
          title="기술 평가서"
          from="담당 코치"
          deadlineLabel="확인 가능"
          onSign={() => navigate("/skill-report")}
        />
      </div>
      <SectionHead title="보관함" action="더보기 ›" />
      <div className="px-3 sm:px-5 flex flex-col gap-2">
        <DocStorageItem
          title="지난 달 출석 증명서"
          date="2025.03.31"
          status="signed"
        />
        <DocStorageItem title="작년 수료증" date="2024.12.31" status="signed" />
        <DocStorageItem title="지난 평가서" date="2024.10.15" status="signed" />
      </div>
    </div>
  );

  // ─── B4 부가서비스 ──────────────────────
  const extraTab = (
    <div className="flex flex-col">
      <SectionHead title={MESSAGES.wallet.extra.frequentTitle} />
      <QuickServicesGrid
        items={[
          {
            label: "랭킹",
            color: "var(--c-sun-500)",
            icon: "🏆",
            onClick: () => navigate("/ranking"),
          },
          {
            label: "뱃지",
            color: "var(--c-flame-500)",
            icon: "🎖️",
            onClick: () => navigate("/badges"),
          },
          {
            label: "스티커",
            color: "var(--c-mint-500)",
            icon: "✨",
            onClick: () => navigate("/stickers"),
          },
          {
            label: "체크\n리스트",
            color: "var(--c-ice-500)",
            icon: "✅",
            onClick: () => navigate("/checklist"),
          },
        ]}
      />

      <SectionHead title={MESSAGES.wallet.extra.moreTitle} />
      <MoreServicesList
        items={[
          {
            title: "내 일정",
            sub: "오늘/주간 수업 일정",
            tag: MESSAGES.wallet.extra.tagRecommend,
            tagColor: "flame",
            onClick: () => navigate(isChild ? "/schedule" : "/calendar"),
          },
          {
            title: "선물 / 보상",
            sub: "쿠폰 / 뱃지 보관함",
            tag: MESSAGES.wallet.extra.tagNew,
            tagColor: "ice",
            onClick: () => navigate("/gift"),
          },
          {
            title: "대회 일정",
            sub: "진행 중 / 예정 대회",
            onClick: () => navigate("/tournaments"),
          },
          {
            title: "갤러리",
            sub: "팀 사진 / 영상",
            onClick: () => navigate("/photos"),
          },
        ]}
      />
    </div>
  );

  return (
    <div style={{ visibility: loading ? "hidden" : "visible" }} aria-hidden={loading}>
      <MobileContainer hasBottomNav>
        <div className="flex-1 min-h-0 flex flex-col">
          <WalletScreen
            tabs={[
              { id: "pay", label: MESSAGES.wallet.tabsStudent.pay },
              { id: "mship", label: MESSAGES.wallet.tabsStudent.mship },
              { id: "doc", label: MESSAGES.wallet.tabsStudent.doc },
              { id: "extra", label: MESSAGES.wallet.tabsStudent.extra },
            ]}
            initialTab="pay"
            tabContents={{
              pay: payTab,
              mship: mshipTab,
              doc: docTab,
              extra: extraTab,
            }}
            appBar={{
              forceNative: true,
              timelineBadge: unreadCount > 0 ? unreadCount : undefined,
              onSearch: () => navigate("/search"),
              onTimeline: () => navigate("/timeline"),
              onMy: () => navigate("/notifications"),
              onMenu: openMenu,
            }}
            // 2026-05-08: QR 출석체크 폐기. floating QR 제거.
          />
        </div>
        <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
      </MobileContainer>
    </div>
  );
}

function QrIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}
