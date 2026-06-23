'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { useIsNative } from '@/hooks/useIsNative';
import { registerWebAppBarMount } from '@/hooks/useNativeUI';
import { resolvePageTitle } from '@/lib/page-titles';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { AppBarActionButton } from '@/components/layout/AppBarActions';

// AppBar 공통 상수 — Material 3 Top App Bar / iOS Navigation Bar 호환.
// (이전 './appbar-constants' 파일을 inline 함 — wrapper 통합 시 단일 SoT 로 흡수)
const APP_BAR_HEIGHT_CLASS = 'h-14'; // 56px — isKid 분기에서만 사용
const APP_BAR_PADDING_X_CLASS = 'px-5'; // 20px — isKid 분기에서만 사용
const APP_BAR_BASE_CLASS =
  'sticky top-0 z-20 bg-wbg dark:bg-rink-900 border-b border-wline-2 dark:border-rink-800';

const GlobalMenu = dynamic(
  () => import('@/components/layout/GlobalMenu').then((mod) => ({ default: mod.GlobalMenu })),
  { ssr: false },
);

/**
 * TEAMPLUS 공통 AppBar — 전체 사용자 / 전 화면 단일 SoT (2026-04-30 v2.3)
 *
 * v2.3 — variant 별 레이아웃 명확 분리, 헤더 높이만 60px 로 통일:
 *   variant='main'    : 메인 대시보드 (홈 6개) — 좌측 큰 타이틀 + 우측 4 액션 (검색·타임라인·알림·메뉴)
 *   variant='submain' : BottomNav 탭 허브 (~25개) — main 과 시각 100% 동일
 *   variant='default' : 일반 서브 페이지 — 좌측 ← 뒤로가기 + 중앙 타이틀 + 우측 ≡ 햄버거 메뉴 ★복원
 *   variant='logo'    : 로고 중앙 (랜딩/공용) — 우측 ≡ 햄버거 메뉴
 *
 *   레이아웃 차이:
 *     · main / submain : [큰 타이틀]               [🔍 ⏰ 👤 ≡] (4 액션)
 *     · default        : [←] [타이틀]                            [≡] (단순 3 요소)
 *
 *   헤더 높이: 모두 60px (isKid 만 h-16). 좌/우 아이콘 size-10 (40×40), main/submain 의
 *     vertical 액션은 44×48 — 시각 무게는 동일.
 *
 *   default variant 토글:
 *     showBack (default: true · variant='main'/'submain' 시 자동 false)
 *     showMenu (default: true)
 *     rightActions[] / rightAction 명시 시 → ≡ 자리 대체 (커스텀 슬롯)
 *
 *   main / submain variant 토글 (4 액션):
 *     showSearch / showTimeline / showMy / showMenu (각 default true)
 *     onSearch / onTimeline / onMy / onMenu 미지정 시 기본 동작:
 *       검색 → /search · 타임라인 → /notices · 알림(prop명 onMy) → /notifications · 메뉴 → GlobalMenu
 *     timelineBadge 미지정 시 useNotificationCount unreadCount 자동 배지.
 *
 *   Backward compat:
 *     - mainActions 객체 (구버전 main 호출자) → top-level prop 으로 자동 매핑
 *     - showNotification (구 default) → 무시 (default 에 알림 자리 없음, 호출자 정리 권장)
 *
 *   사용 예 (래퍼 권장 — variant 별 thin wrapper 가 호출자 가독성 확보):
 *     ┌── 메인 대시보드 (홈 6종) ────────────────────────────────
 *     │  <WalletAppBar title onSearch onTimeline onMy onMenu />     ← variant="main"
 *     ├── BottomNav 탭 허브 (25종) ─────────────────────────────
 *     │  <SubmainAppBar title="페이지명" />                          ← variant="submain"
 *     ├── 일반 서브 페이지 (215+종) ────────────────────────────
 *     │  <DefaultAppBar title="페이지명" />                          ← variant="default"
 *     │  <DefaultAppBar title showBack={false} />                   (← 숨김)
 *     │  <DefaultAppBar title showMenu={false} />                   (≡ 숨김)
 *     │  <DefaultAppBar title extraActions={[{icon, onClick, label}]} />  (≡ 앞에 아이콘 추가)
 *     │  <DefaultAppBar title rightActions={[...]} />               (≡ 자리 대체)
 *     └────────────────────────────────────────────────────────────
 */

/** 우측 액션 버튼 (rightActions 배열 항목) — backward compat */
export interface HeaderAction {
  /** Material Symbol 아이콘 이름 */
  icon: string;
  onClick: () => void;
  /** 접근성 라벨 (필수) */
  label: string;
  /** 추가 CSS 클래스 (배지 등) */
  className?: string;
}

/** Main variant 4 액션 객체 (구버전 호출자 backward compat) */
export interface MainActions {
  onSearch?: () => void;
  onTimeline?: () => void;
  /** 타임라인 우측상단 배지 (0/null/undefined 면 미표시 — useNotificationCount 자동 폴백) */
  timelineBadge?: number | null;
  onMy?: () => void;
  onMenu?: () => void;
  /** QR 출석 액션 — 알림 아이콘 왼쪽. opt-in(기본 미표시). */
  onQr?: () => void;
  showSearch?: boolean;
  showTimeline?: boolean;
  showMy?: boolean;
  showMenu?: boolean;
  showQr?: boolean;
}

export interface PageAppBarProps {
  /** 페이지 타이틀. 미지정 시 resolvePageTitle 자동 폴백 */
  title?: string;
  /** 부제 (default variant 에서만 표시) */
  subtitle?: string;
  /**
   * AppBar 스타일:
   *  - 'default' (기본): [← 뒤로가기] [타이틀 중앙] [🔍 ⏰ 👤 ≡] (우측 4 액션)
   *  - 'logo'         : [여백]       [🏒 TEAMPLUS] [🔍 ⏰ 👤 ≡]
   *  - 'main'         : [큰 타이틀 좌측]            [🔍 ⏰ 👤 ≡]  ← 메인 대시보드 (홈 6개)
   *  - 'submain'      : main 과 시각 100% 동일 — BottomNav 탭 허브 화면
   *  - 'detail'       : [← 뒤로] [타이틀 좌측 inline]   [⏰ 🔔 ≡]  ← 상세 페이지 (← 옆 타이틀 + main 우측 3 액션)
   */
  variant?: 'default' | 'logo' | 'main' | 'submain' | 'detail';
  /** 시각 톤 변형 — 역할별 헤더 흡수 (kid 그룹은 WCAG AAA) */
  toneVariant?: 'default' | 'dark' | 'kid';
  /** 뒤로가기 버튼 표시 (기본: true · variant='main'/'submain' 시 자동 false) */
  showBack?: boolean;
  /** 뒤로가기 커스텀 핸들러 */
  onBack?: () => void;

  // ── 우측 4 액션 통합 prop (모든 variant 공통) ─────────────────
  /** 검색 액션 표시 (default true) — false 지정 시 숨김 */
  showSearch?: boolean;
  /** 타임라인(알림) 액션 표시 (default true) */
  showTimeline?: boolean;
  /** 알림 액션 표시 (default true) — prop 이름은 backward compat 위해 showMy 유지, 라벨은 "알림" */
  showMy?: boolean;
  /** 메뉴 액션 표시 (default true) */
  showMenu?: boolean;
  /** QR 출석 액션 표시 (default false · opt-in) — 알림 아이콘 왼쪽에 배치 */
  showQr?: boolean;
  /** 검색 클릭 핸들러 — 미지정 시 navigate('/search') */
  onSearch?: () => void;
  /** 타임라인 클릭 핸들러 — 미지정 시 navigate('/notifications') */
  onTimeline?: () => void;
  /** 알림 클릭 핸들러 — 미지정 시 navigate('/notifications'). prop 이름은 backward compat 위해 onMy 유지. */
  onMy?: () => void;
  /** 메뉴 클릭 핸들러 — 미지정 시 GlobalMenu 자동 활성 */
  onMenu?: () => void;
  /** QR 출석 클릭 핸들러 — showQr=true 일 때 알림 왼쪽에 노출 */
  onQr?: () => void;
  /** 타임라인 우측상단 배지 — 미지정 시 useNotificationCount unreadCount 자동 */
  timelineBadge?: number | null;

  // ── default variant 추가 액션 ────────────────────────────────
  /**
   * default variant 에서 햄버거 ≡ 앞에 추가로 표시할 아이콘 액션.
   * 햄버거는 그대로 유지된 채 그 왼쪽에 아이콘이 추가됨.
   * 예: <PageAppBar title="자녀 관리" extraActions={[{icon:'add', onClick, label:'추가'}]} />
   *   → [←] [타이틀]  [+] [≡]
   *
   * main/submain variant 는 4 액션이 이미 풍부하므로 영향 없음.
   */
  extraActions?: HeaderAction[];

  // ── Backward compat ──────────────────────────────────────────
  /** @deprecated default 에 알림 자리 없음 — extraActions 사용 권장. */
  showNotification?: boolean;
  /** @deprecated top-level prop (showSearch/onSearch 등) 사용 권장. */
  mainActions?: MainActions;
  /**
   * 우측 단일 커스텀 액션 — 명시 시 햄버거 ≡ 와 extraActions 모두 대체.
   * default variant 의 우측 영역 전체를 사용자 정의 노드로 교체.
   */
  rightAction?: ReactNode;
  /**
   * 우측 다중 액션 — 명시 시 햄버거 ≡ 와 extraActions 모두 대체.
   * 햄버거를 유지하며 아이콘만 추가하려면 `extraActions` 를 사용.
   */
  rightActions?: HeaderAction[];

  // ── 기타 ─────────────────────────────────────────────────────
  /** 스크롤 시 투명도 효과 (`bg-white/80 backdrop-blur-md`). CLAUDE.md 명시 예외 */
  scrollOpacity?: boolean;
  /** 네이티브(Flutter WebView) 환경에서도 강제로 DOM 헤더 렌더링 */
  forceNative?: boolean;
  /** 외부 추가 클래스 (도피 해치) */
  className?: string;
  /**
   * 타이틀 폰트 사이즈/굵기 className 오버라이드 (default/detail variant 만 적용).
   * 미지정 시 variant 기본값 사용 (default: `text-[22px] font-bold`, kid: `text-[22px] font-extrabold`).
   * 예: `titleClassName="text-[24px] font-bold"` → 24px 타이틀.
   *
   * 2026-05-11: 사용자 요구로 모든 화면 AppBar 타이틀 22px 통일.
   */
  titleClassName?: string;
  /**
   * 타이틀을 헤더 가로 중앙에 절대배치 (default/detail variant 만 적용).
   * 미지정(false) 시 기존 동작(← 뒤로가기 옆 좌측 정렬) 유지 — 기존 호출자 영향 없음.
   * back/우측 액션과 독립적으로 화면 정중앙에 위치하며 pointer-events 를 통과시킨다.
   */
  centerTitle?: boolean;
}

export function PageAppBar({
  title,
  subtitle,
  variant = 'default',
  toneVariant = 'default',
  showBack,
  onBack,
  showSearch,
  showTimeline,
  showMy,
  showMenu,
  showQr,
  onSearch,
  onTimeline,
  onMy,
  onMenu,
  onQr,
  timelineBadge,
  extraActions,
  showNotification,
  mainActions,
  rightAction,
  rightActions,
  scrollOpacity = false,
  forceNative = false,
  className,
  titleClassName,
  centerTitle = false,
}: PageAppBarProps) {
  const { back, navigate } = useNavigation();
  const { unreadCount } = useNotificationCount();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isNative, isReady } = useIsNative();

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else back();
  }, [onBack, back]);

  // [2026-05-13 이슈 D15/P2] 헤더가 실제 렌더될 때만 sentinel 등록.
  //   - Native 환경 + forceNative=false 면 null 반환되므로 등록하지 않음.
  //   - forceNative=true 또는 Web 환경에서만 카운트 증가.
  //   useNativeUI 에서 hasWebAppBarMounted() 와 showAppBar:true 동시 호출 시 dev-only warn.
  const willRender = (isReady || forceNative) && (forceNative || !isNative);
  useEffect(() => {
    if (!willRender) return;
    const release = registerWebAppBarMount();
    return release;
  }, [willRender]);

  // Native 환경 자동 숨김 (Flutter AppBar 가 그려지므로 이중 헤더 방지)
  // forceNative 헤더는 WebView 탭 허브의 실제 AppBar 역할을 하므로
  // 브릿지/UA 감지 완료를 기다리지 않고 즉시 렌더링한다.
  if (!isReady && !forceNative) return null;
  if (isNative && !forceNative) return null;

  // title 명시 없으면 PAGE_TITLES SoT 매핑 자동 폴백
  const effectiveTitle = title ?? resolvePageTitle(pathname ?? '') ?? '';

  // ── 톤별 클래스 ─────────────────────────────────────────────
  const isDark = toneVariant === 'dark';
  const isKid = toneVariant === 'kid';
  // submain 은 main 과 시각 100% 동일하게 처리 (BottomNav 탭 허브 통일)
  const isMain = variant === 'main' || variant === 'submain';
  // [2026-05-09] default 도 detail 패턴으로 통합 — 메인/서브메인이 아닌 모든
  //   화면(default · detail · 215+ 서브 페이지)이 동일한 ← + 타이틀 inline +
  //   우측 3 액션(시계/종/메뉴) 패턴 사용. logo 만 별도 처리.
  const isDetailLike =
    variant === 'detail' || variant === 'default' || variant === undefined;

  // variant='main'/'submain' 일 때는 뒤로가기 자동 비활성 (허브 화면).
  // detail/default 는 항상 뒤로가기 노출 (명시 false 만 숨김).
  const effectiveShowBack = showBack ?? (isDetailLike ? true : !isMain);

  // ── 4 액션 통합 처리 (top-level prop > mainActions 객체 > 기본값) ────
  const ma = mainActions ?? {};
  // [변경 2026-05-28] 사용자 요구 — 모든 사용자 AppBar 에서 타임라인(시계) 액션 일괄 숨김.
  //   검색(showSearch) 액션과 동일하게 기본 비활성화. showTimeline 을 명시적으로 true 로
  //   넘기는 경우(향후 페이지별 opt-in)에만 노출. showNotification(@deprecated) alias 도
  //   과거 타임라인 노출 트리거였으므로 함께 제거하여 전 화면 일관 숨김을 보장.
  void showNotification; // backward-compat prop 보존(무시) — 타임라인 노출 트리거 해제
  const showTimelineEffective = showTimeline ?? ma.showTimeline ?? false;
  // [변경 2026-05-08] 모든 사용자 AppBar 에서 검색 액션 기본 비활성.
  //   사용자 요청 — 메인/서브메인 4-액션 영역에서 검색 버튼을 일괄 제거.
  //   showSearch 를 명시적으로 true 로 넘기는 경우(향후 페이지별 옵트인)에만 노출.
  const a4 = {
    showSearch: showSearch ?? ma.showSearch ?? false,
    showTimeline: showTimelineEffective,
    showQr: showQr ?? ma.showQr ?? false,
    showMy: showMy ?? ma.showMy ?? true,
    showMenu: showMenu ?? ma.showMenu ?? true,
    onSearch: onSearch ?? ma.onSearch ?? (() => navigate('/search')),
    // QR 출석 — opt-in. 핸들러 미지정 시 액션 미노출(showQr 만으로는 동작 없음).
    onQr: onQr ?? ma.onQr,
    // [변경 2026-05-17] 타임라인/알림 destination:
    //   타임라인(시계) → /timeline (활동 내역 피드 — 수업·결제·코치 메모 시간순)
    //   알림(벨)       → /notifications (개인 알림 센터)
    onTimeline: onTimeline ?? ma.onTimeline ?? (() => navigate('/timeline')),
    onMy: onMy ?? ma.onMy ?? (() => navigate('/notifications')),
    onMenu: onMenu ?? ma.onMenu, // undefined 면 기본 GlobalMenu 활성
  };
  const effectiveBadge =
    (timelineBadge ?? ma.timelineBadge ?? null) ??
    (unreadCount > 0 ? unreadCount : null);

  // [추가 2026-05-19 v2] 사용자 직접 지시 — BottomNav tab 처럼 현재 경로에 해당하는
  //   AppBar 액션 아이콘을 ice-500 활성 톤으로 표시. BottomNav `isActiveItem` 과
  //   동일한 정확 매칭 또는 `/` 하위만 매칭 규칙 사용 (다른 경로가 우연히 prefix
  //   매칭되어 양쪽 active 되는 회귀 방지).
  //
  // 안전망: pathname 에 query/hash 가 섞이는 경우(`/timeline?from=...`) 또는
  //   trailing slash(`/timeline/`) 가 붙는 경우 모두 활성 매칭되도록 정규화.
  //   Next.js `usePathname()` 은 query/hash 를 제외한 path 만 반환하지만,
  //   하이브리드 WebView 환경의 일부 라우팅 케이스에서 변형이 관찰되어 방어적.
  const rawPath = pathname ?? '';
  const currentPath = rawPath.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  const isTimelineActive =
    currentPath === '/timeline' || currentPath.startsWith('/timeline/');
  const isNotificationsActive =
    currentPath === '/notifications' ||
    currentPath.startsWith('/notifications/');

  // ── 헤더 셸 (높이/패딩) ──────────────────────────────────────
  // 모든 variant (main/submain/default/logo) 60px 통일. isKid 만 h-16 + 더 큰 패딩.
  const heightClass = isKid ? 'h-16' : APP_BAR_HEIGHT_CLASS;
  const paddingClass = isKid ? 'px-6' : APP_BAR_PADDING_X_CLASS;

  const baseShell = scrollOpacity
    ? 'sticky top-0 z-20 bg-white/80 dark:bg-rink-900/80 backdrop-blur-md border-b border-wline-2 dark:border-rink-800'
    : isDark
      ? 'sticky top-0 z-20 bg-rink-900 text-white border-b border-rink-800'
      : APP_BAR_BASE_CLASS;

  // [2026-05-08 v3] 전 variant 일관 autolayout — iOS 다이나믹 아일랜드 / Android
  //   punch-hole / status bar 와의 시각적 여유 확보를 위해 모든 variant 에 상단
  //   padding 일괄 적용 (사용자 요구 "web 모든 화면에 autolayout 적용").
  //   기존: h-[60px] 고정 → 시뮬레이터에서 status bar 바로 아래에 텍스트가 붙음
  //   수정: min-h-[60px] + pt-2.5 (10px) — body padding-top(safe-area-inset-top) 위에
  //         추가 10px 여유로 답답함 해소.
  //   isKid 만 별도 처리 (h-16 + 더 큰 패딩 — WCAG AAA 큰 터치 타겟 유지).
  const shellHeight = isKid
    ? cn(heightClass, paddingClass)
    : 'min-h-[60px] pt-2.5 pb-1 px-[var(--mobile-page-x)]';

  const shellClass = cn(
    baseShell,
    shellHeight,
    'flex shrink-0 items-center relative',
    className,
  );

  // ──────────────────────────────────────────────────────────
  // 4 액션 우측 영역 (main / submain / default / logo 공통)
  // ──────────────────────────────────────────────────────────
  const right4Actions = (
    // [변경 2026-05-09] AppBar main/submain 우측 액션 minimal 패턴 (참고자료 04c 매칭).
    //   icon-only 40×40 버튼 3종 (타임라인 / 알림 / 메뉴) 연속 배치.
    //   gap: 0 (참고자료의 버튼 인접 배치와 일치)
    //   marginRight / translateX 는 기존 레이아웃 시스템 유지.
    <div
      className="flex items-center"
      style={{
        marginRight: 'var(--appbar-action-trailing-space)',
        transform: 'translateX(var(--appbar-content-shift-x))',
      }}
    >
      {a4.showSearch && (
        <AppBarActionButton icon="search" label="검색" onClick={a4.onSearch} isDark={isDark} />
      )}
      {a4.showTimeline && (
        <AppBarActionButton
          icon="schedule"
          label="타임라인"
          onClick={a4.onTimeline}
          badge={effectiveBadge != null}
          isDark={isDark}
          isActive={isTimelineActive}
        />
      )}
      {a4.showQr && a4.onQr && (
        <AppBarActionButton
          icon="qr_code_scanner"
          label={MESSAGES.qrScan.parentButton}
          onClick={a4.onQr}
          isDark={isDark}
        />
      )}
      {a4.showMy && (
        <AppBarActionButton
          icon="notifications"
          label="알림"
          onClick={a4.onMy}
          badge={unreadCount > 0}
          isDark={isDark}
          isActive={isNotificationsActive}
        />
      )}
      {a4.showMenu && (
        <AppBarActionButton
          icon="menu"
          label="메뉴"
          onClick={a4.onMenu ?? (() => setIsMenuOpen(true))}
          isDark={isDark}
        />
      )}
    </div>
  );

  // ──────────────────────────────────────────────────────────
  // variant='detail' / 'default' 렌더링 — ← + 타이틀 좌측 inline + 우측 3 액션
  //   메인/서브메인이 아닌 모든 화면 공통 패턴 (215+ 서브 페이지 + 상세 페이지).
  //
  // 우측 영역 우선순위 (backward compat 보존):
  //   1. rightAction / rightActions[] 명시 → 우측 전체 대체
  //   2. extraActions[] 명시           → [...extra] [☰] 패턴 (시계/종 자동 숨김 — 기존 default 동작)
  //   3. 그 외(기본)                    → 시계/종/메뉴 (detail 패턴 = 새 기본)
  //   showMenu/showTimeline/showMy=false 로 개별 액션 숨김 가능.
  // ──────────────────────────────────────────────────────────
  if (isDetailLike) {
    const detailIconColor = isDark
      ? 'text-white hover:bg-white/10'
      : 'text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-800';
    const detailTitleColor = isDark
      ? 'text-white'
      : 'text-wtext-1 dark:text-white';
    // [2026-05-11] AppBar 타이틀 22px 통일 (사용자 요구). 일반/kid 모두 22px,
    //   weight 만 차등 유지 (kid=extrabold, 일반=bold). titleClassName 명시 override 만 예외.
    const defaultTitleSize = isKid ? 'text-[22px] font-extrabold' : 'text-[22px] font-bold';
    const titleSize = titleClassName ?? defaultTitleSize;

    // 우측 영역 분기 — backward compat 우선순위
    const hasCustomRight =
      (rightActions && rightActions.length > 0) || !!rightAction;
    const hasExtraActions = !!extraActions && extraActions.length > 0;

    let rightSlot: ReactNode;
    if (rightActions && rightActions.length > 0) {
      rightSlot = (
        <div className="flex items-center gap-0.5 ml-auto">
          {rightActions.map((action, idx) => (
            <button
              key={`${action.icon}-${idx}`}
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              className={cn(
                'flex items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                isKid ? 'size-12' : 'size-10',
                detailIconColor,
                action.className,
              )}
            >
              <Icon
                name={action.icon}
                weight={500}
                size={isKid ? 26 : 24}
                className={isKid ? 'text-[26px]' : 'text-[24px]'}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      );
    } else if (rightAction) {
      rightSlot = <div className="flex items-center ml-auto">{rightAction}</div>;
    } else if (hasExtraActions) {
      // 기존 default 동작: extraActions + 햄버거 (시계/종 자동 숨김)
      rightSlot = (
        <div className="flex items-center gap-0.5 ml-auto">
          {extraActions!.map((action, idx) => (
            <button
              key={`extra-${action.icon}-${idx}`}
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              className={cn(
                'flex shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                isKid ? 'size-12' : 'size-10',
                detailIconColor,
                action.className,
              )}
            >
              <Icon
                name={action.icon}
                weight={500}
                size={isKid ? 26 : 24}
                className={isKid ? 'text-[26px]' : 'text-[24px]'}
                aria-hidden="true"
              />
            </button>
          ))}
          {a4.showMenu && (
            <button
              type="button"
              onClick={a4.onMenu ?? (() => setIsMenuOpen(true))}
              className={cn(
                'flex shrink-0 -mr-2 size-10 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                detailIconColor,
              )}
              aria-label="전체 메뉴 열기"
              aria-expanded={isMenuOpen}
            >
              <Icon
                name="menu"
                weight={500}
                className="text-[24px]"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      );
    } else {
      // 새 기본: 시계 / 종 / 메뉴 (detail 패턴)
      rightSlot = right4Actions;
    }

    return (
      <>
        <header className={shellClass}>
          {/* 좌측: ← 뒤로가기 + 타이틀 inline (← 옆에 바로) */}
          {effectiveShowBack ? (
            <button
              type="button"
              onClick={handleBack}
              className={cn(
                'flex shrink-0 -ml-2 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                isKid ? 'size-12' : 'size-10',
                detailIconColor,
              )}
              aria-label="뒤로 가기"
            >
              <Icon
                name="arrow_back_ios_new"
                weight={500}
                className={isKid ? 'text-[26px]' : 'text-[24px]'}
                aria-hidden="true"
              />
            </button>
          ) : (
            <div className={cn('shrink-0', isKid ? 'size-12' : 'size-10')} />
          )}
          <div
            className={
              centerTitle
                ? 'pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center px-14'
                : 'min-w-0 flex-1 ml-1'
            }
          >
            <h1
              className={cn(
                'truncate leading-none',
                titleSize,
                detailTitleColor,
              )}
              style={{ letterSpacing: '-0.02em' }}
            >
              {effectiveTitle}
            </h1>
            {subtitle && (
              <span
                className={cn(
                  'mt-0.5 block text-[11px] font-medium leading-none truncate',
                  isDark ? 'text-wtext-4' : 'text-wtext-3 dark:text-rink-300',
                )}
              >
                {subtitle}
              </span>
            )}
          </div>
          {centerTitle && <div className="min-w-0 flex-1" />}

          {rightSlot}
        </header>

        {/* GlobalMenu 자동 활성 — onMenu 미지정 + showMenu=true 일 때만 */}
        {!a4.onMenu && a4.showMenu && !hasCustomRight && (
          <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        )}
      </>
    );
  }

  // ──────────────────────────────────────────────────────────
  // variant='main' / 'submain' 렌더링 — 좌측 큰 타이틀 + 우측 4 액션
  // ──────────────────────────────────────────────────────────
  if (isMain) {
    return (
      <>
        <header className={shellClass}>
          {/* 좌측: 큰 타이틀 (h1 22px font-extrabold)
              회귀 방지 (2026-05-07):
                기존 fontSize 26 + letterSpacing -0.03em 에서 "팀플러스" 4글자가
                약 124px 폭을 차지하여 우측 4 액션(48×4 + gap = 198px) 과 합쳐 360dp
                Android 화면 폭을 초과 → flex-shrink 기본값 1 로 h1 이 압축되며
                "팀플러" + "스" 으로 wrap 발생.
                해결:
                  · fontSize 26 → 22 (시각 임팩트 보존, 폭 ~15% 감소)
                  · letterSpacing -0.03em → -0.04em (한글 자연스러운 압축 강화)
                  · whiteSpace: 'nowrap' (어떤 글리프 폭에도 wrap 절대 차단)
                  · flexShrink: 0 (flex 컨테이너 폭 부족해도 h1 압축 금지) */}
          <h1
            className={cn(
              'font-extrabold tracking-tight',
              isDark ? 'text-white' : 'text-wtext-1 dark:text-white',
            )}
            style={{
              fontSize: 'var(--appbar-title-size)',
              letterSpacing: '-0.04em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              lineHeight: 1.15,
              transform: 'translateX(var(--appbar-content-shift-x))',
            }}
          >
            {effectiveTitle}
          </h1>

          <div className="flex-1" />

          {right4Actions}
        </header>

        {/* main/submain 도 기본 GlobalMenu 제공 (onMenu 미지정 시) */}
        {!a4.onMenu && a4.showMenu && (
          <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        )}
      </>
    );
  }

  // ──────────────────────────────────────────────────────────
  // variant='logo' 렌더링 — 로고 중앙 + 우측 햄버거
  //   default 는 위 isDetailLike 분기에서 처리되어 이 경로에 도달하지 않는다.
  // ──────────────────────────────────────────────────────────
  const iconColorClass = isDark
    ? 'text-white hover:bg-white/10'
    : 'text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-800';
  const backButtonSize = isKid ? 'size-12' : 'size-10';

  return (
    <>
      <header className={cn(shellClass, 'justify-between')}>
        <div className={backButtonSize} />
        <div className="absolute inset-x-0 flex items-center justify-center gap-2 pointer-events-none">
          <div className="w-8 h-8 bg-ice-500 rounded-lg flex items-center justify-center">
            <Icon name="sports_hockey" className="text-white text-lg" aria-hidden="true" />
          </div>
          <span className="text-lg font-extrabold text-wtext-1 dark:text-white tracking-tight">
            TEAMPLUS
          </span>
        </div>
        {a4.showMenu ? (
          <button
            type="button"
            onClick={a4.onMenu ?? (() => setIsMenuOpen(true))}
            className={cn(
              'flex shrink-0 -mr-2 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
              backButtonSize,
              iconColorClass,
            )}
            aria-label="전체 메뉴 열기"
            aria-expanded={isMenuOpen}
          >
            <Icon
              name="menu"
              weight={500}
              className={isKid ? 'text-[26px]' : 'text-[24px]'}
              aria-hidden="true"
            />
          </button>
        ) : (
          <div className={backButtonSize} />
        )}
      </header>

      {!a4.onMenu && a4.showMenu && (
        <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────
// MainAppBarAction — 폐기 (2026-05-09).
// 본 컴포넌트는 `@/components/layout/AppBarActions` 의 `AppBarActionButton` 으로
// 분리·승격되어 모든 화면에서 import 사용 가능합니다.
// 사용 예: import { AppBarActionButton, AppBarRight3Actions } from '@/components/layout/AppBarActions';
// ──────────────────────────────────────────────────────────

export default PageAppBar;
