"use client";

/**
 * 관리자(시스템) 메인화면 — Wallet 4탭 (매출 / 회원 / 문서 / 부가)
 * 2026-04-29 신한pLay 월렛 풍 재구성. 기존 admin API 호출, useNativeUI,
 * useNotificationCount 모두 보존. RBAC 무수정.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { logEnvironmentInfo } from "@/lib/environment";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { usePageReady } from "@/hooks/usePageReady";
import { useStableLayout } from "@/hooks/useStableLayout";
import { useImagesReady } from "@/hooks/useImagesReady";
import { useFontsReady } from "@/hooks/useFontsReady";
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

interface AdminDashboardLite {
  totalMembers: number;
  pendingApprovals: number;
  monthlyRevenue: number;
  monthlyRevenueProgress: number;
  todayRevenue: number;
  todayAttendance: number;
  activeClasses: number;
}

const FALLBACK: AdminDashboardLite = {
  totalMembers: 0,
  pendingApprovals: 0,
  monthlyRevenue: 0,
  monthlyRevenueProgress: 0,
  todayRevenue: 0,
  todayAttendance: 0,
  activeClasses: 0,
};

export default function AdminDashboardPage() {
  const { navigate } = useNavigation();
  const { user } = useSessionAuth();
  const { unreadCount } = useNotificationCount();

  // v17 anti-flicker (2026-05-16): FALLBACK 으로 초기화하여 첫 paint 부터 구조 렌더.
  // `return null` (unmount→mount 전환 깜박임) 대신 visibility 토글로 콘텐츠 mount 유지.
  // SoT: SPEC_ANTI_FLICKER.md §2.2
  const [data, setData] = useState<AdminDashboardLite>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // v16.3 (2026-05-16): useStableLayout — main wrapper ResizeObserver 기반 layout 안정화 감지.
  // Wallet 4탭 sub-component(MembershipHeroCard, QuickServicesGrid, MoreServicesList 등)
  // mount/paint 완료 보장. SoT: SPEC_LOADING_STABLE_PAINT.md §2.1.
  const mainRef = useRef<HTMLDivElement>(null);
  // [성능 2026-05-28 P0-A] 400→220ms. [2026-05-30 LD-04] 220→150ms. 레이아웃 디바운스 윈도우 단축 (데이터·이미지·폰트는 별도 신호가 보장).
  const isLayoutStable = useStableLayout(mainRef, { stableMs: 150 });

  // 풀스크린 로더 fast-path (v18, 2026-05-20) — 4중 안전망 합성:
  //   ① !loading (admin/dashboard API 도착) ② layout stable (sub-component paint)
  //   ③ 이미지 decode 완료 ④ Pretendard 폰트 swap 완료
  // SoT: LOADING_TIMING_POLICY.md §11 (사용자 직접 지시 — 데이터+셋팅 완료 전 hide 절대 금지)
  const imagesReady = useImagesReady([data, isLayoutStable]);
  const fontsReady = useFontsReady();
  usePageReady(!loading && isLayoutStable && imagesReady && fontsReady);

  const fetchData = useCallback(async () => {
    try {
      const r = await api.get<AdminDashboardLite>("/dashboard/admin");
      if (r.success && r.data) {
        setData({
          totalMembers: r.data.totalMembers ?? 0,
          pendingApprovals: r.data.pendingApprovals ?? 0,
          monthlyRevenue: r.data.monthlyRevenue ?? 0,
          monthlyRevenueProgress: r.data.monthlyRevenueProgress ?? 0,
          todayRevenue: r.data.todayRevenue ?? 0,
          todayAttendance: r.data.todayAttendance ?? 0,
          activeClasses: r.data.activeClasses ?? 0,
        });
      } else {
        setData(FALLBACK);
      }
    } catch {
      setData(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openMenu = useCallback(() => {
    logEnvironmentInfo("menu", "admin");
    setIsMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !loading,
    showBackButton: false,
    showMenuButton: false,
  });

  // [v17 anti-flicker 2026-05-16] return null 제거 — visibility wrapper 로 mount 유지.
  // LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료될 때까지 콘텐츠는 visibility:hidden.
  // SoT: SPEC_ANTI_FLICKER.md §2.2 (옵션 A — 가장 안전한 invisible wrapper).
  const isHidden = loading;

  const adminName = user?.name || "관리자";

  // ─── B1 매출·정산 ─────────────────────────
  const payTab = (
    <div className="flex flex-col">
      <RecordCardPromo
        customTitle="시스템 활동 카드 만들어 보세요"
        onStart={() => navigate("/statistics")}
      />

      <ViewToggleAndChips
        chips={[
          { label: "결제 관리", onClick: () => navigate("/payments-manage") },
          { label: "정산 관리", onClick: () => navigate("/settlements") },
        ]}
      />

      <MonthlyDuePill
        amount={data.monthlyRevenue}
        label="이번달 누적 매출"
        score={`${data.monthlyRevenueProgress}%`}
        onClick={() => navigate("/payments-manage")}
      />

      <HeroPassCard
        title="시스템 운영"
        subtitle={`${adminName} · ${data.totalMembers}명 회원 · ${data.activeClasses}개 수업`}
        amountLabel="오늘 매출"
        amount={data.todayRevenue}
        actions={[
          {
            label: "통계",
            icon: <ChartIcon />,
            onClick: () => navigate("/statistics"),
          },
          {
            label: "승인",
            icon: <CheckIcon />,
            onClick: () => navigate("/members"),
          },
          {
            label: "더보기",
            icon: <DotsIcon />,
            onClick: () => navigate("/admin-schedules"),
          },
        ]}
        cardWatermark="ADMIN"
        onCardClick={() => navigate("/statistics")}
      />

      <PaymentMethodList
        methods={[
          {
            name: "결제 관리",
            sub: `오늘 ${data.todayRevenue.toLocaleString()}원`,
            color: "var(--c-mint-100)",
            icon: "P",
            onClick: () => navigate("/payments-manage"),
          },
          {
            name: "정산 관리",
            sub: "코치/감독 정산",
            color: "var(--c-flame-100)",
            icon: "S",
            onClick: () => navigate("/settlements"),
          },
        ]}
      />
    </div>
  );

  // ─── B2 회원(멤버십) ──────────────────────
  const mshipTab = (
    <div className="flex flex-col">
      <MembershipHeroCard
        grade="ADMIN"
        gradeColor="var(--c-flame-500)"
        clubName="팀플러스 시스템 관리자"
        userName={`${adminName}`}
        memberInfo="시스템 운영자 · 정회원"
        stats={[
          {
            label: "총 회원",
            value: `${data.totalMembers.toLocaleString()}명`,
          },
          { label: "오늘 출석", value: `${data.todayAttendance}명` },
          { label: "승인 대기", value: `${data.pendingApprovals}명` },
        ]}
      />

      <SectionHead
        title="회원 관리"
        action="전체 ›"
        onActionClick={() => navigate("/members")}
      />
      <div className="px-3 sm:px-5 pt-2 grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate("/members")}
          className="bg-wsurface dark:bg-rink-800 rounded-2xl p-3 sm:p-4 text-left border-0 active:brightness-95 min-w-0"
        >
          <div className="text-card-meta text-wtext-3 truncate">총 회원</div>
          <div className="font-num text-card-title sm:text-card-section font-extrabold text-wtext-1 dark:text-white tabular-nums truncate">
            {data.totalMembers.toLocaleString()}
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/coach-manage")}
          className="bg-wsurface dark:bg-rink-800 rounded-2xl p-3 sm:p-4 text-left border-0 active:brightness-95 min-w-0"
        >
          <div className="text-card-meta text-wtext-3 truncate">코치 관리</div>
          <div className="font-num text-card-title sm:text-card-section font-extrabold text-wtext-1 dark:text-white truncate">
            관리
          </div>
        </button>
      </div>

      <SectionHead
        title="제휴 혜택 발급"
        action="발급 ›"
        onActionClick={() => navigate("/popups")}
      />
      <AffiliateBenefitsGrid
        benefits={[
          { name: "신규 가입 쿠폰", off: "발급", color: "var(--c-flame-100)" },
          { name: "대회 우대권", off: "발급", color: "var(--c-mint-100)" },
          { name: "장비 할인권", off: "발급", color: "var(--c-ice-100)" },
          { name: "주차권", off: "발급", color: "var(--c-sun-100)" },
        ]}
      />
    </div>
  );

  // ─── B3 문서 ─────────────────────────────
  const docTab = (
    <div className="flex flex-col">
      <AlertBanner
        body={
          <span className="break-keep">
            처리 대기{" "}
            <span
              className="font-extrabold tabular-nums"
              style={{ color: "var(--c-flame-500)" }}
            >
              {data.pendingApprovals}건
            </span>
            이 있어요
          </span>
        }
        onClick={() => navigate("/members")}
      />
      <SectionHead title="대기중" />
      <div className="px-3 sm:px-5 flex flex-col gap-2">
        <DocItem
          title="회원 등록 신청"
          from={`${data.pendingApprovals}건 대기`}
          deadlineLabel="검토 필요"
          urgent={data.pendingApprovals > 0}
          onSign={() => navigate("/members")}
        />
        <DocItem
          title="코치 승인 검토"
          from="신규 코치 검토"
          deadlineLabel="검토 필요"
          onSign={() => navigate("/coach-manage")}
        />
      </div>
      <SectionHead title="보관함" action="더보기 ›" />
      <div className="px-3 sm:px-5 flex flex-col gap-2">
        <DocStorageItem
          title="시스템 운영 정책"
          date="2024.01.01"
          status="signed"
        />
        <DocStorageItem
          title="개인정보 처리방침"
          date="2024.06.15"
          status="signed"
        />
        <DocStorageItem title="이용약관" date="2024.06.15" status="signed" />
      </div>
    </div>
  );

  // ─── B4 부가 ─────────────────────────────
  const extraTab = (
    <div className="flex flex-col">
      <SectionHead title={MESSAGES.wallet.extra.frequentTitle} />
      <QuickServicesGrid
        items={[
          {
            label: "통계",
            color: "var(--c-ice-500)",
            icon: <Icon name="bar_chart" />,
            onClick: () => navigate("/statistics"),
          },
          {
            label: "승인",
            color: "var(--c-mint-500)",
            icon: <Icon name="check_circle" />,
            onClick: () => navigate("/members"),
          },
          {
            label: "공지\n발송",
            color: "var(--c-flame-500)",
            icon: <Icon name="campaign" />,
            onClick: () => navigate("/notices/create"),
          },
          {
            label: "정산",
            color: "var(--c-sun-500)",
            icon: <Icon name="payments" />,
            onClick: () => navigate("/settlements"),
          },
        ]}
      />

      <SectionHead title={MESSAGES.wallet.extra.moreTitle} />
      <MoreServicesList
        items={[
          {
            title: "대회 관리",
            sub: "전체 대회 관리",
            tag: MESSAGES.wallet.extra.tagRecommend,
            tagColor: "flame",
            onClick: () => navigate("/tournament-manage"),
          },
          {
            title: "경기장 관리",
            sub: "링크/경기장 관리",
            tag: MESSAGES.wallet.extra.tagNew,
            tagColor: "ice",
            onClick: () => navigate("/venue-manage"),
          },
          {
            title: "재고 관리",
            sub: "장비/재고 관리",
            onClick: () => navigate("/inventory"),
          },
          {
            title: "팝업 관리",
            sub: "배너/팝업 관리",
            onClick: () => navigate("/popups"),
          },
        ]}
      />
    </div>
  );

  return (
    <div
      style={{ visibility: isHidden ? "hidden" : "visible" }}
      aria-hidden={isHidden}
    >
    <MobileContainer hasBottomNav>
      <div ref={mainRef} className="flex-1 min-h-0 flex flex-col">
        <WalletScreen
          tabs={[
            { id: "pay", label: MESSAGES.wallet.tabsAdmin.pay },
            { id: "mship", label: MESSAGES.wallet.tabsAdmin.mship },
            { id: "doc", label: MESSAGES.wallet.tabsAdmin.doc },
            { id: "extra", label: MESSAGES.wallet.tabsAdmin.extra },
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
          floating={{
            // 관리자 화면에서는 좌측 QR 버튼 영역 비표시 (onQrClick 미전달)
            onPlusClick: () => alert(MESSAGES.wallet.floating.plusComing),
          }}
        />
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
    </div>
  );
}

function ChartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      stroke="#fff"
      strokeWidth="2"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 4h2v16H3zM7 4h1v16H7zM10 4h2v16h-2zM14 4h1v16h-1zM17 4h2v16h-2z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      stroke="#fff"
      strokeWidth="2"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true" focusable="false">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}
