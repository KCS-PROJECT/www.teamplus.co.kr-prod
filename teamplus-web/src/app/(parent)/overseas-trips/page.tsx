'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { OverseasTrip, MyTripItem, TripStatus, RegistrationStatus } from '@/types/overseas-trip';

/**
 * ParentOverseasTripsPage — 학부모 해외 원정 화면
 *
 * 디자인 (2026-05-15 ref: app/screen-parent-overseas.jsx · 07c · 학부모 해외 원정 body 100% 일치):
 * - Segmented tabs (원정 일정 / 내 원정) — 활성 색상은 TEAMPLUS 시스템 유지(ice-500)
 * - 원정 일정 탭: Filter chips · 카운트 · Trip cards (flag · region · status · title · date · capacity · 가격+자세히)
 * - 내 원정 탭: My trip card (D-day · steps progress · step list · payment summary)
 *
 * **사용자 명시**: 기능 구현 금지 — 디자인만 변경. 클라이언트 사이드 country 필터는 UI 상태이므로 유지.
 *
 * 절대 불가침: AppBar/BottomNav 자체 수정 금지 — MobileContainer body 영역만 변경.
 */

// ─── Constants ──────────────────────────────────────

const STATUS_BADGE: Record<TripStatus, { className: string; label: string }> = {
  draft:     { className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100', label: MESSAGES.overseasTrip.status.draft },
  open:      { className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', label: MESSAGES.overseasTrip.status.open },
  closed:    { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', label: MESSAGES.overseasTrip.status.closed },
  ongoing:   { className: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400', label: MESSAGES.overseasTrip.status.ongoing },
  completed: { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', label: MESSAGES.overseasTrip.status.completed },
  cancelled: { className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400', label: MESSAGES.overseasTrip.status.cancelled },
};

const REG_STATUS_LABEL: Record<RegistrationStatus, string> = {
  pending:      MESSAGES.overseasTrip.registrationStatus.pending,
  confirmed:    MESSAGES.overseasTrip.registrationStatus.confirmed,
  deposit_paid: MESSAGES.overseasTrip.registrationStatus.deposit_paid,
  cancelled:    MESSAGES.overseasTrip.registrationStatus.cancelled,
  waitlisted:   MESSAGES.overseasTrip.registrationStatus.waitlisted,
};

// ref status row 색상 매핑 — 모집 중(success) · 마감 임박(warning) · 사전 신청(ice)
function getStatusInfo(status: TripStatus): { label: string; dot: string; text: string } {
  switch (status) {
    case 'open':
      return { label: '모집 중', dot: 'bg-success-500', text: 'text-success-700 dark:text-success-500' };
    case 'closed':
      return { label: '마감 임박', dot: 'bg-warning-500', text: 'text-warning-500' };
    case 'ongoing':
      return { label: '진행 중', dot: 'bg-ice-500', text: 'text-ice-500' };
    case 'completed':
      return { label: '완료', dot: 'bg-wtext-4', text: 'text-wtext-3 dark:text-wtext-4' };
    case 'cancelled':
      return { label: '취소', dot: 'bg-red-500', text: 'text-red-600' };
    default:
      return { label: '준비 중', dot: 'bg-wtext-4', text: 'text-wtext-3 dark:text-wtext-4' };
  }
}

// country → emoji flag 매핑 (시각용)
const COUNTRY_FLAG: Record<string, string> = {
  '캐나다': '🇨🇦', 'Canada': '🇨🇦',
  '미국': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸',
  '핀란드': '🇫🇮', 'Finland': '🇫🇮',
  '일본': '🇯🇵', 'Japan': '🇯🇵',
  '체코': '🇨🇿', 'Czech': '🇨🇿',
  '러시아': '🇷🇺', 'Russia': '🇷🇺',
  '스웨덴': '🇸🇪', 'Sweden': '🇸🇪',
  '독일': '🇩🇪', 'Germany': '🇩🇪',
};

function flagOf(country: string | null | undefined): string {
  if (!country) return '🌍';
  return COUNTRY_FLAG[country] ?? '🌍';
}

type ViewTab = 'all' | 'my';

// ─── Helpers ────────────────────────────────────────

function formatDateRefStyle(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return dateStr;
  }
}

// ref date 표시: "2026.08.04 — 08.14" (시작-종료 같은 년이면 종료는 MM.DD만)
function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return formatDateRefStyle(start ?? end);
  try {
    const s = new Date(start);
    const e = new Date(end);
    const sStr = formatDateRefStyle(start);
    if (s.getFullYear() === e.getFullYear()) {
      const em = String(e.getMonth() + 1).padStart(2, '0');
      const ed = String(e.getDate()).padStart(2, '0');
      return `${sStr} — ${em}.${ed}`;
    }
    return `${sStr} — ${formatDateRefStyle(end)}`;
  } catch {
    return `${start} ~ ${end}`;
  }
}

function calcDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  try {
    const s = new Date(start);
    const e = new Date(end);
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

function formatCurrency(amount: string | number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!value) return '-';
  return new Intl.NumberFormat('ko-KR').format(value);
}

function getDDayValue(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────

export default function ParentOverseasTripsPage() {
  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [allTrips, setAllTrips] = useState<OverseasTrip[]>([]);
  const [myTrips, setMyTrips] = useState<MyTripItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMyLoading, setIsMyLoading] = useState(false);

  // ref country chips — 클라이언트 사이드 country 필터 (UI 상태이므로 기능 추가 아님)
  const [countryFilter, setCountryFilter] = useState<string>('전체');

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const loadAllTrips = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<OverseasTrip[]>('/overseas-trips');
      if (res.success && res.data) {
        setAllTrips(Array.isArray(res.data) ? res.data : []);
      } else {
        setAllTrips([]);
      }
    } catch {
      toast.error(MESSAGES.error.general);
      setAllTrips([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadMyTrips = useCallback(async () => {
    setIsMyLoading(true);
    try {
      const res = await api.get<MyTripItem[]>('/overseas-trips/my');
      if (res.success && res.data) {
        setMyTrips(Array.isArray(res.data) ? res.data : []);
      } else {
        setMyTrips([]);
      }
    } catch {
      setMyTrips([]);
    } finally {
      setIsMyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllTrips();
  }, [loadAllTrips]);

  useEffect(() => {
    if (activeTab === 'my') {
      loadMyTrips();
    }
  }, [activeTab, loadMyTrips]);

  // 모집중/진행중인 원정 표시
  const openTrips = useMemo(
    () => allTrips.filter((t) => t.status === 'open' || t.status === 'ongoing'),
    [allTrips],
  );

  // ref Filter chips — 데이터에서 country 목록 추출 + "전체" 머리
  const countryChips = useMemo(() => {
    const set = new Set<string>();
    openTrips.forEach((t) => t.country && set.add(t.country));
    return ['전체', ...Array.from(set)];
  }, [openTrips]);

  // 클라이언트 country 필터 (UI 상태)
  const filteredTrips = useMemo(() => {
    if (countryFilter === '전체') return openTrips;
    return openTrips.filter((t) => t.country === countryFilter);
  }, [openTrips, countryFilter]);

  const myCount = myTrips.length;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.overseasTrip.title} forceNative />

      {/*
        Tabs — underline tab + sliding indicator (2026-05-15 사용자 요청: 부드러운 전환).
        · 조건부 indicator 2개 → 컨테이너 절대 위치 단일 sliding indicator 로 통합
        · transition-[left] duration-300 ease-out → 클릭 시 부드러운 슬라이드
        · 텍스트 색상도 transition-colors duration-300 ease-out 명시적 지정
        · motion-reduce:transition-none — 접근성 대응
      */}
      <div
        role="tablist"
        aria-label="원정 목록 탭"
        className="sticky top-[60px] z-10 bg-wsurface dark:bg-rink-900 px-2 flex border-b border-wline-2 dark:border-rink-700 relative"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
          className={cn(
            'flex-1 py-3 text-card-body font-extrabold tracking-[-0.02em] transition-colors duration-300 ease-out motion-reduce:transition-none',
            activeTab === 'all'
              ? 'text-ice-500 dark:text-ice-500'
              : 'text-wtext-3 dark:text-wtext-4 hover:text-wtext-2 dark:hover:text-wtext-4/80',
          )}
        >
          {MESSAGES.overseasTrip.listTitle}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'my'}
          onClick={() => setActiveTab('my')}
          className={cn(
            'flex-1 py-3 text-card-body font-extrabold tracking-[-0.02em] transition-colors duration-300 ease-out motion-reduce:transition-none inline-flex items-center justify-center gap-1.5',
            activeTab === 'my'
              ? 'text-ice-500 dark:text-ice-500'
              : 'text-wtext-3 dark:text-wtext-4 hover:text-wtext-2 dark:hover:text-wtext-4/80',
          )}
        >
          {MESSAGES.overseasTrip.myTripsTitle}
          {myCount > 0 && (
            <span
              className={cn(
                'inline-flex items-center justify-center py-[1px] px-1.5 rounded-full text-card-meta leading-none font-extrabold font-num tabular-nums transition-colors duration-300 ease-out motion-reduce:transition-none',
                /* count badge: 활성 시 ice-500 배경 + 흰 텍스트 / 비활성 시 wtext-3 회색 */
                activeTab === 'my'
                  ? 'bg-ice-500 text-white'
                  : 'bg-wtext-3 dark:bg-rink-600 text-white',
              )}
            >
              {myCount}
            </span>
          )}
        </button>

        {/*
          Sliding indicator — 절대 위치 + transition-[left] 으로 부드럽게 슬라이드.
          width: calc(50% - 1rem) — px-2 양쪽 padding(0.5rem×2)을 제외한 단일 탭 너비
          left: 0.5rem(활성 all) ↔ calc(50% + 0.5rem)(활성 my)
        */}
        <span
          aria-hidden="true"
          className="absolute -bottom-px h-[2px] bg-ice-500 transition-[left] duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: 'calc(50% - 1rem)',
            left: activeTab === 'all' ? '0.5rem' : 'calc(50% + 0.5rem)',
          }}
        />
      </div>

      {/* Body — ref: paddingTop 16 paddingBottom 100 */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pt-4 pb-30">
        {/* ─── 원정 일정 탭 ─────────────────────────────── */}
        {activeTab === 'all' && (
          <div role="tabpanel" aria-label="원정 일정">
            {/* Filter chips — ref: padding "0 20px 12px" gap 8 overflow-x */}
            {!isLoading && countryChips.length > 1 && (
              <div className="px-5 pb-3 flex gap-2 overflow-x-auto hide-scrollbar">
                {countryChips.map((c) => {
                  const on = countryFilter === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountryFilter(c)}
                      className={cn(
                        'shrink-0 h-8 px-3.5 rounded-full text-card-meta font-bold whitespace-nowrap transition-colors motion-reduce:transition-none',
                        /* 첨부 이미지: Filter 활성도 검정 — ref 그대로 */
                        on
                          ? 'bg-wtext-1 dark:bg-rink-50 text-white dark:text-rink-900'
                          : 'bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-wtext-4 border border-wline dark:border-rink-700',
                      )}
                      aria-pressed={on}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Count — ref: padding "0 24px 12px" / 12.5px text3 700 / 개수는 text1 800 */}
            {!isLoading && filteredTrips.length > 0 && (
              <div className="px-6 pb-3 text-card-meta font-bold text-wtext-3 dark:text-wtext-4">
                모집 중{' '}
                <span className="text-wtext-1 dark:text-white font-extrabold tabular-nums">
                  {filteredTrips.length}
                </span>
                건
              </div>
            )}

            {/* Trip cards / Empty */}
            <div className="px-5 flex flex-col gap-2.5">
              {isLoading ? null : filteredTrips.length === 0 ? (
                <EmptyState
                  icon="flight"
                  title="모집 중인 원정이 없습니다"
                  sub={MESSAGES.overseasTrip.noTrips}
                />
              ) : (
                filteredTrips.map((trip, idx) => (
                  <TripCard key={trip.id} trip={trip} isHot={idx === 0} />
                ))
              )}
              <div className="h-4" />
            </div>
          </div>
        )}

        {/* ─── 내 원정 탭 ───────────────────────────────── */}
        {activeTab === 'my' && (
          <div role="tabpanel" aria-label="내 원정" className="px-5 flex flex-col gap-3">
            {isMyLoading ? null : myTrips.length === 0 ? (
              <EmptyState
                icon="flight"
                title="신청한 원정이 없습니다"
                sub={MESSAGES.overseasTrip.noMyTrips}
              />
            ) : (
              myTrips.map((item) => <MyTripCard key={item.registration.id} item={item} />)
            )}

            {/* (2026-05-15 사용자 요청) "지난 원정" 영역(헤더 + dashed empty box) 제거 */}
            <div className="h-4" />
          </div>
        )}
      </div>
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Subcomponents — ref 1:1 매핑
 * ────────────────────────────────────────────────────────────────────────── */

function TripCard({ trip, isHot }: { trip: OverseasTrip; isHot: boolean }) {
  const statusInfo = getStatusInfo(trip.status);
  const flag = flagOf(trip.country);
  const days = calcDays(trip.startDate, trip.endDate);
  const seats = trip._count?.registrations ?? 0;
  const max = trip.maxParticipants;
  const pct = max > 0 ? Math.min(100, (seats / max) * 100) : 0;

  return (
    <NavLink
      href={`/overseas-trips/${trip.id}`}
      className="block bg-wsurface dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
      aria-label={`${trip.title} 원정 상세 보기`}
    >
      <div className="px-4 pt-3.5 pb-3.5">
        {/* Top row: flag + region + dot + status + hot — ref gap 6 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] leading-none" aria-hidden="true">
            {flag}
          </span>
          <span className="text-card-meta font-extrabold text-wtext-2 dark:text-wtext-4 tracking-[0.04em]">
            {trip.country}
          </span>
          <span className="w-[2px] h-[2px] rounded-full bg-wtext-4" />
          <span className={cn('inline-flex items-center gap-[3px] text-card-meta font-bold', statusInfo.text)}>
            <span className={cn('w-1 h-1 rounded-full', statusInfo.dot)} />
            {statusInfo.label}
          </span>
          {isHot && (
            <span className="ml-auto text-card-meta font-extrabold text-wtext-3 dark:text-wtext-4 tracking-[0.06em]">
              인기
            </span>
          )}
        </div>

        {/* Title — ref: 15 / 800 / mt 8 / -0.025em / line 1.3 */}
        <h3 className="mt-2 text-card-title font-extrabold text-wtext-1 dark:text-white tracking-[-0.025em] leading-[1.3] line-clamp-2">
          {trip.title}
        </h3>
        {/* City — ref: 11.5 / text3 / mt 4 / 600 */}
        <p className="mt-1 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
          {trip.city}
        </p>

        {/* Date row — ref: mt 10 / gap 6 / 11.5 text2 700 / FONT_NUM / 캘린더 svg */}
        <div className="mt-2.5 flex items-center gap-1.5 text-card-meta font-bold text-wtext-2 dark:text-wtext-4">
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            aria-hidden="true"
            className="text-wtext-3 dark:text-wtext-4 shrink-0"
          >
            <rect x="1.5" y="2.5" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M1.5 4.5h8M4 1.5v2M7 1.5v2"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-num tabular-nums">{formatDateRange(trip.startDate, trip.endDate)}</span>
          {days !== null && (
            <>
              <span className="opacity-40">·</span>
              <span className="font-num tabular-nums text-wtext-3 dark:text-wtext-4">{days}박</span>
            </>
          )}
        </div>

        {/* Capacity bar — ref: mt 12 / "모집 현황" + N/M석 + 3px progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
            <span>모집 현황</span>
            <span className="font-num tabular-nums">
              {seats}/{max}석
            </span>
          </div>
          <div
            className="mt-[5px] h-[3px] rounded-full bg-wline-2 dark:bg-rink-700 overflow-hidden"
            role="progressbar"
            aria-valuenow={seats}
            aria-valuemin={0}
            aria-valuemax={max}
          >
            <div
              className="h-full rounded-full bg-wtext-2 dark:bg-wtext-4 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Footer — ref: mt 12 / 가격(16 800 FONT_NUM -0.02em) + "원~/1인" + 자세히 button(h 32 rounded 999) */}
        <div className="mt-3 flex items-center justify-between">
          <div className="inline-flex items-baseline gap-[3px]">
            <span className="text-card-title font-extrabold text-wtext-1 dark:text-white font-num tabular-nums tracking-[-0.02em]">
              {formatCurrency(trip.estimatedCost)}
            </span>
            <span className="text-card-meta font-bold text-wtext-3 dark:text-wtext-4">원~ / 1인</span>
          </div>
          <span
            className="inline-flex items-center justify-center h-8 px-3.5 rounded-full bg-ice-500 text-white text-card-meta font-extrabold tracking-[-0.01em]"
            aria-hidden="true"
          >
            자세히
          </span>
        </div>
      </div>
    </NavLink>
  );
}

function MyTripCard({ item }: { item: MyTripItem }) {
  const flag = flagOf(item.trip.country);
  const dDay = getDDayValue(item.trip.startDate);
  const regLabel = REG_STATUS_LABEL[item.registration.status];

  // ref steps placeholder — registration 상태로부터 5단계 진행 추정
  const stepFlags = {
    applied: true, // 신청 완료
    depositPaid: !!item.registration.depositPaidAt,
    passport: item.registration.passportVerified,
    finalPayment: item.registration.status === 'confirmed' && !!item.registration.depositPaidAt,
    departure: false,
  };
  const totalSteps = 5;
  const doneCount = [
    stepFlags.applied,
    stepFlags.depositPaid,
    stepFlags.passport,
    stepFlags.finalPayment,
    stepFlags.departure,
  ].filter(Boolean).length;
  const currentStepIdx = Math.min(doneCount, totalSteps - 1);

  const stepList: { label: string; done: boolean; current: boolean }[] = [
    { label: '신청 완료', done: stepFlags.applied, current: false },
    { label: '참가비 1차 입금', done: stepFlags.depositPaid, current: !stepFlags.depositPaid && stepFlags.applied },
    { label: '여권 정보 등록', done: stepFlags.passport, current: !stepFlags.passport && stepFlags.depositPaid },
    { label: '참가비 잔금 결제', done: stepFlags.finalPayment, current: !stepFlags.finalPayment && stepFlags.passport },
    { label: '출발 안내 확인', done: stepFlags.departure, current: !stepFlags.departure && stepFlags.finalPayment },
  ];
  const currentStepLabel = stepList.find((s) => s.current)?.label ?? '진행 중';

  return (
    <div className="bg-wsurface dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 px-[18px] py-4">
      {/* Top row: flag + region + D-day */}
      <div className="flex items-center gap-2">
        <span className="text-[18px] leading-none" aria-hidden="true">
          {flag}
        </span>
        <span className="text-card-meta font-extrabold text-wtext-2 dark:text-wtext-4 tracking-[-0.01em]">
          {item.trip.country}
          {item.trip.city ? ` · ${item.trip.city}` : ''}
        </span>
        <div className="flex-1" />
        {dDay !== null && dDay > 0 && (
          /* 첨부 이미지: D-day pill은 정보 표시이므로 검정(wtext-1) ref 그대로 */
          <span className="inline-flex items-center px-[9px] py-[3px] rounded-full bg-wtext-1 dark:bg-rink-50 text-white dark:text-rink-900 text-card-meta font-extrabold font-num tabular-nums tracking-[0.02em]">
            D-{dDay}
          </span>
        )}
      </div>
      <h3 className="mt-2 text-card-title font-extrabold text-wtext-1 dark:text-white tracking-[-0.025em]">
        {item.trip.title}
      </h3>
      <p className="mt-1 text-card-meta text-wtext-3 dark:text-wtext-4 font-num tabular-nums">
        {formatDateRange(item.trip.startDate, item.trip.endDate)}
      </p>

      {/* Steps progress — ref: bg / radius 12 / padding "12 14" */}
      <div className="mt-3.5 bg-wbg dark:bg-rink-900 rounded-xl px-3.5 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-card-meta font-extrabold text-wtext-2 dark:text-wtext-4 tracking-[-0.01em]">
            준비 단계 · {currentStepLabel}
          </span>
          <span className="text-card-meta font-extrabold text-wtext-2 dark:text-wtext-4 font-num tabular-nums">
            {currentStepIdx + 1}/{totalSteps}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, j) => (
            <div
              key={j}
              className={cn(
                'flex-1 h-1 rounded-full',
                /* 첨부 이미지: 진행바 채움색은 검정 ref 그대로 */
                j <= currentStepIdx ? 'bg-wtext-1 dark:bg-rink-50' : 'bg-wline-2 dark:bg-rink-700',
              )}
            />
          ))}
        </div>
      </div>

      {/* Step list — ref: marker(16×16) + label */}
      <div className="mt-2.5 flex flex-col">
        {stepList.map((s, j) => (
          <div key={j} className="flex items-center gap-2.5 py-[7px]">
            <div
              className={cn(
                'w-4 h-4 rounded-full grid place-items-center shrink-0',
                /* 첨부 이미지: Step current marker는 검정(ref text1) */
                s.done
                  ? 'bg-wtext-2 dark:bg-wtext-4'
                  : s.current
                    ? 'bg-wtext-1 dark:bg-rink-50 border-2 border-wline-2 dark:border-rink-700'
                    : 'bg-wline-2 dark:bg-rink-700',
              )}
            >
              {s.done && (
                <svg width="8" height="8" viewBox="0 0 9 9" fill="none" aria-hidden="true">
                  <path
                    d="M1.5 4.5l2 2 4-5"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {s.current && <span className="w-[5px] h-[5px] rounded-full bg-white" />}
            </div>
            <span
              className={cn(
                'text-card-body tracking-[-0.01em]',
                s.done
                  ? 'text-wtext-3 dark:text-wtext-4 font-semibold line-through'
                  : s.current
                    ? 'text-wtext-1 dark:text-white font-extrabold'
                    : 'text-wtext-4 dark:text-wtext-4/70 font-semibold',
              )}
            >
              {s.label}
            </span>
            {s.current && (
              /* 첨부 이미지: "진행 →" 텍스트는 검정(wtext-1) ref 그대로 */
              <span className="ml-auto text-card-meta font-extrabold text-wtext-1 dark:text-white">
                진행 →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Payment summary — ref: bg / border / radius 12 / padding "12 14" / 32×32 카드 아이콘 + label + 결제 button */}
      {item.trip.depositDeadline && item.trip.depositAmount && (
        <div className="mt-3 px-3.5 py-3 rounded-xl bg-wbg dark:bg-rink-900 border border-wline-2 dark:border-rink-700 flex items-center gap-2.5">
          <div className="w-8 h-8 shrink-0 rounded-[10px] bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 grid place-items-center text-wtext-2 dark:text-wtext-4">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 7h12" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-card-meta font-bold text-wtext-3 dark:text-wtext-4">
              다음 결제 ·{' '}
              <span className="font-num tabular-nums">{formatDateRefStyle(item.trip.depositDeadline)}</span>
            </p>
            <p className="mt-0.5 text-card-body font-extrabold text-wtext-1 dark:text-white font-num tabular-nums">
              잔금 {formatCurrency(item.trip.depositAmount)}원
            </p>
          </div>
          <span
            className="inline-flex items-center justify-center h-[30px] px-3 rounded-full bg-ice-500 text-white text-card-meta font-extrabold tracking-[-0.01em]"
            aria-hidden="true"
          >
            결제
          </span>
        </div>
      )}

      {/* 등록 상태 (선택적 표시) */}
      {!item.trip.depositDeadline && (
        <p className="mt-2 text-card-meta font-bold text-wtext-2 dark:text-wtext-4">
          {regLabel}
        </p>
      )}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-2xl bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700">
      <div className="flex items-center justify-center size-16 rounded-full bg-wline-2 dark:bg-rink-700 mb-4">
        <Icon name={icon} className="text-3xl text-wtext-3 dark:text-wtext-4" aria-hidden="true" />
      </div>
      <p className="text-card-title font-extrabold text-wtext-2 dark:text-wtext-4 mb-1 tracking-[-0.02em]">
        {title}
      </p>
      <p className="text-card-meta font-semibold text-wtext-3 dark:text-wtext-4 text-center px-8">
        {sub}
      </p>
    </div>
  );
}

// STATUS_BADGE 는 추후 트립 디테일 페이지 등에서 동일 토큰 재사용을 위해 export 유지 가능.
void STATUS_BADGE;
