'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import {
  useMyClubId,
  useTrainingList,
  TRAINING_TYPES,
  TRAINING_TYPE_LABELS,
  TRAINING_TYPE_ICONS,
  type TrainingSession,
  type TrainingType,
} from '@/hooks/useTraining';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

// [추가 2026-05-11] 로그인 사용자 역할 → 한글 호칭.
const ROLE_KO_LABEL: Record<string, string> = {
  ADMIN: '관리자', SYSTEM: '관리자', OPER: '관리자',
  DIRECTOR: '감독', ACADEMY_DIRECTOR: '감독',
  COACH: '코치', PARENT: '부모', TEEN: '학생', CHILD: '학생',
};
function getRoleLabel(userType?: string | null): string {
  if (!userType) return '코치';
  return ROLE_KO_LABEL[userType.toUpperCase()] ?? '코치';
}

// ─── Filter Chip 타입 ──────────────────────────────
type TypeFilter = 'all' | TrainingType;

const TYPE_CHIPS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  ...TRAINING_TYPES.map((t) => ({ key: t as TypeFilter, label: TRAINING_TYPE_LABELS[t] })),
];

// ─── Helpers ───────────────────────────────────────
function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Training Card ─────────────────────────────────
function TrainingCard({ item }: { item: TrainingSession }) {
  const typeInfo = TRAINING_TYPE_ICONS[item.trainingType] ?? TRAINING_TYPE_ICONS.REGULAR_TRAINING;
  const typeLabel = TRAINING_TYPE_LABELS[item.trainingType] ?? item.trainingType;
  const scheduleCount = item._count?.schedules ?? 0;
  const enrolledCount = item._count?.enrollments ?? 0;
  const fillRate = item.capacity > 0 ? Math.min(100, Math.round((enrolledCount / item.capacity) * 100)) : 0;
  // [추가 2026-05-11] 로그인 사용자 역할에 맞춘 호칭.
  const { user } = useSessionAuth();
  const roleLabel = getRoleLabel(user?.userType);

  return (
    <NavLink
      href={`/training-manage/${item.id}`}
      className="group block bg-white dark:bg-rink-800 rounded-2xl border border-wline dark:border-rink-700 hover:border-ice-500 dark:hover:border-ice-500 transition-colors motion-reduce:transition-none active:brightness-95"
    >
      <div className="p-5">
        {/* 상단: 아이콘 + 타입 + 타이틀 */}
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
              typeInfo.bg,
            )}
          >
            <Icon name={typeInfo.icon} className={cn('text-2xl', typeInfo.color)} aria-hidden="true" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn('text-card-meta font-semibold px-2 py-0.5 rounded-md shrink-0', typeInfo.bg, typeInfo.color)}>
                {typeLabel}
              </span>
              {!item.isActive && (
                <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 bg-wline-2 dark:bg-rink-700 px-2 py-0.5 rounded-md">
                  비활성
                </span>
              )}
            </div>
            <h3 className="text-card-title font-bold text-wtext-1 dark:text-white truncate leading-snug">
              {item.className}
            </h3>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-0.5 truncate">
              {item.instructorName} {roleLabel}
              {item.startTime && item.endTime && (
                <> · {formatTime(item.startTime)}–{formatTime(item.endTime)}</>
              )}
            </p>
          </div>

          <Icon
            name="chevron_right"
            className="text-wtext-4 dark:text-rink-500 text-xl shrink-0 group-hover:text-ice-500 transition-colors motion-reduce:transition-none"
            aria-hidden="true"
          />
        </div>

        {/* 하단: 정원 진행률 + 일정 수 */}
        <div className="mt-4 flex items-center gap-4">
          {/* 정원 진행 바 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
                <Icon name="groups" className="text-card-body" aria-hidden="true" />
                <span>정원</span>
              </div>
              <span className="text-card-meta tabular-nums text-wtext-2 dark:text-rink-100">
                <span className="font-semibold text-wtext-1 dark:text-white">{enrolledCount}</span>
                <span className="text-wtext-3 dark:text-rink-300"> / {item.capacity}명</span>
              </span>
            </div>
            <div className="h-1.5 bg-wline-2 dark:bg-rink-700 rounded-w-pill overflow-hidden" role="progressbar" aria-valuenow={fillRate} aria-valuemin={0} aria-valuemax={100} aria-label={`정원 충원율 ${fillRate}%`}>
              <div
                className={cn(
                  'h-full rounded-w-pill transition-all motion-reduce:transition-none',
                  fillRate >= 100 ? 'bg-red-500' : fillRate >= 80 ? 'bg-amber-500' : 'bg-ice-500',
                )}
                style={{ width: `${fillRate}%` }}
              />
            </div>
          </div>

          {/* 일정 수 */}
          <div className="shrink-0 flex flex-col items-end text-right">
            <span className="text-card-meta text-wtext-3 dark:text-rink-300 flex items-center gap-1">
              <Icon name="event" className="text-card-body" aria-hidden="true" />
              일정
            </span>
            <span className="text-card-body font-semibold text-wtext-1 dark:text-white tabular-nums mt-0.5">
              {scheduleCount}<span className="text-card-meta font-normal text-wtext-3 dark:text-rink-300 ml-0.5">건</span>
            </span>
          </div>
        </div>
      </div>
    </NavLink>
  );
}

// ─── Page Component ────────────────────────────────
export default function TrainingManagePage() {
  const { clubId } = useMyClubId();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');

  const { data: trainings, isLoading, error, refresh } = useTrainingList(clubId);

  usePageReady(!isLoading);

  // 네이티브 앱 UI 제어 (AppBar/BottomNav 네이티브 렌더 동기화)
  //  SPEC v2 §5 Step D 권고: 단순 리스트 화면은 isDataLoaded 가드를 제거해
  //  fetch 실패 시 status bar 영구 숨김(v1 회귀)을 방지.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '훈련 관리',
    showBottomNav: true,
  });

  // 클라이언트 사이드 필터링
  const filteredTrainings = useMemo(() => {
    let result = trainings;
    if (typeFilter !== 'all') {
      result = result.filter((t) => t.trainingType === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.className.toLowerCase().includes(q) ||
          t.instructorName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [trainings, typeFilter, search]);

  // 상단 요약 지표 (필터 미적용 전체 기준)
  const summary = useMemo(() => {
    const active = trainings.filter((t) => t.isActive).length;
    const totalSchedules = trainings.reduce((sum, t) => sum + (t._count?.schedules ?? 0), 0);
    const totalEnrolled = trainings.reduce((sum, t) => sum + (t._count?.enrollments ?? 0), 0);
    return { total: trainings.length, active, totalSchedules, totalEnrolled };
  }, [trainings]);

  const hasFilter = typeFilter !== 'all' || search.trim().length > 0;

  // ─── 필터 칩 가로 스크롤 제어 ─────────────────────
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateChipsScrollState = useCallback(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 칩 스크롤 상태 재측정 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  useEffect(() => {
    updateChipsScrollState();
  }, [updateChipsScrollState, screenWidth]);

  const scrollChips = (direction: 'left' | 'right') => {
    const el = chipsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const handleChipsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  // 마우스 드래그 스크롤
  const dragState = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });

  const handleChipsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return; // 터치/펜은 네이티브 스크롤 유지
    const el = chipsScrollRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
    };
  };

  const handleChipsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const el = chipsScrollRef.current;
    if (!el) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > 3) dragState.current.moved = true;
    el.scrollLeft = dragState.current.startScroll - dx;
  };

  const endChipsDrag = () => {
    dragState.current.active = false;
  };

  const handleChipClick = (e: React.MouseEvent<HTMLButtonElement>, key: TypeFilter) => {
    // 드래그 직후의 click 이벤트 차단 (이동 거리 > 3px)
    if (dragState.current.moved) {
      e.preventDefault();
      dragState.current.moved = false;
      return;
    }
    setTypeFilter(key);
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="훈련 관리" />

      <div className="px-5 pt-5 pb-8 space-y-5">
        {/* 요약 카드 */}
        {!isLoading && !error && trainings.length > 0 && (
          <section
            aria-label="훈련 요약"
            className="bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-2xl px-5 py-4"
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-0.5">전체</p>
                <p className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums">
                  {summary.total}
                  <span className="text-card-meta font-normal text-wtext-3 dark:text-rink-300 ml-0.5">개</span>
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-0.5">
                  활성 {summary.active}
                </p>
              </div>
              <div>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-0.5">일정</p>
                <p className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums">
                  {summary.totalSchedules}
                  <span className="text-card-meta font-normal text-wtext-3 dark:text-rink-300 ml-0.5">건</span>
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-0.5">누적</p>
              </div>
              <div>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-0.5">등록 회원</p>
                <p className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums">
                  {summary.totalEnrolled}
                  <span className="text-card-meta font-normal text-wtext-3 dark:text-rink-300 ml-0.5">명</span>
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-0.5">합계</p>
              </div>
            </div>
          </section>
        )}

        {/* 검색 */}
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-wtext-3 text-card-title pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="훈련 이름 또는 코치 이름으로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="훈련 검색"
            className="w-full h-12 pl-11 pr-11 bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-xl text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 transition-colors motion-reduce:transition-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-w-pill text-wtext-3 hover:text-wtext-2 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
            >
              <Icon name="close" className="text-card-emphasis" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* 유형 필터 칩 (좌/우 스크롤) */}
        <div className="relative -mx-1" role="group" aria-label="훈련 유형 필터">
          {/* 좌측 스크롤 버튼 */}
          <button
            type="button"
            onClick={() => scrollChips('left')}
            aria-label="이전 필터 보기"
            tabIndex={canScrollLeft ? 0 : -1}
            aria-hidden={!canScrollLeft}
            className={cn(
              'hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-w-pill bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sm hover:bg-wbg dark:hover:bg-rink-700 transition-opacity motion-reduce:transition-none',
              canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            <Icon name="chevron_left" className="text-card-title text-wtext-2 dark:text-rink-100" aria-hidden="true" />
          </button>

          {/* 칩 스크롤 컨테이너 */}
          <div
            ref={chipsScrollRef}
            onScroll={updateChipsScrollState}
            onWheel={handleChipsWheel}
            onPointerDown={handleChipsPointerDown}
            onPointerMove={handleChipsPointerMove}
            onPointerUp={endChipsDrag}
            onPointerLeave={endChipsDrag}
            onPointerCancel={endChipsDrag}
            className="flex gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 hide-scrollbar px-1 scroll-smooth motion-reduce:scroll-auto select-none cursor-grab active:cursor-grabbing"
          >
            {TYPE_CHIPS.map((chip) => {
              const isActive = typeFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={(e) => handleChipClick(e, chip.key)}
                  aria-pressed={isActive}
                  className={cn(
                    'h-9 px-4 rounded-w-pill text-card-meta font-medium whitespace-nowrap transition-colors motion-reduce:transition-none shrink-0 border',
                    isActive
                      ? 'bg-rink-900 dark:bg-white text-white dark:text-wtext-1 border-rink-900 dark:border-white'
                      : 'bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700 hover:border-wline dark:hover:border-rink-300',
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* 우측 스크롤 버튼 */}
          <button
            type="button"
            onClick={() => scrollChips('right')}
            aria-label="다음 필터 보기"
            tabIndex={canScrollRight ? 0 : -1}
            aria-hidden={!canScrollRight}
            className={cn(
              'hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-w-pill bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sm hover:bg-wbg dark:hover:bg-rink-700 transition-opacity motion-reduce:transition-none',
              canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            <Icon name="chevron_right" className="text-card-title text-wtext-2 dark:text-rink-100" aria-hidden="true" />
          </button>
        </div>

        {/* 컨텐츠 */}
        {isLoading ? null : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-w-pill flex items-center justify-center mb-4">
              <Icon name="error_outline" className="text-3xl text-red-500" aria-hidden="true" />
            </div>
            <p className="text-card-body text-wtext-2 dark:text-rink-100 mb-5 max-w-xs">{error}</p>
            <button
              type="button"
              onClick={() => refresh()}
              className="h-11 px-5 bg-ice-500 hover:bg-ice-700 text-white text-card-body font-semibold rounded-xl transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {MESSAGES.dashboard.errorRetry}
            </button>
          </div>
        ) : filteredTrainings.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="w-20 h-20 bg-wline-2 dark:bg-rink-800 rounded-2xl flex items-center justify-center mb-5">
              <Icon name={hasFilter ? 'search_off' : 'fitness_center'} className="text-4xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            </div>
            <p className="text-card-emphasis font-semibold text-wtext-1 dark:text-white mb-1.5">
              {hasFilter ? '조건에 맞는 훈련이 없습니다.' : MESSAGES.training.noTrainings}
            </p>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-6 leading-relaxed max-w-[240px]">
              {hasFilter
                ? '검색어나 유형 필터를 변경해 다시 시도해보세요.'
                : '정규훈련, 시합, 펀하키 등 다양한 유형의 훈련 세션을 등록해보세요.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 결과 카운트 */}
            <div className="flex items-center justify-between px-1" role="status" aria-live="polite">
              <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                {hasFilter ? '검색 결과 ' : '표시 중 '}
                <span className="font-semibold text-wtext-1 dark:text-white tabular-nums">{filteredTrainings.length}</span>
                <span className="text-wtext-3 dark:text-rink-300 tabular-nums"> / {summary.total}</span>건
              </p>
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setTypeFilter('all');
                  }}
                  className="text-card-meta text-ice-500 hover:text-ice-700 font-medium transition-colors motion-reduce:transition-none"
                >
                  전체 보기
                </button>
              )}
            </div>

            <ul role="list" aria-label={`훈련 목록 ${filteredTrainings.length}건`} className="space-y-3">
              {filteredTrainings.map((training) => (
                <li key={training.id} role="listitem">
                  <TrainingCard item={training} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Floating Action Button: 훈련 등록 */}
      {!isLoading && !error && (
        <NavLink
          href="/training-manage/create"
          aria-label="훈련 등록하기"
          className="fixed bottom-24 right-5 z-30 flex items-center justify-center h-14 w-14 rounded-w-pill bg-ice-500 hover:bg-ice-700 text-white shadow-md hover:shadow-lg active:brightness-95 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
        >
          <Icon name="add" className="text-2xl" aria-hidden="true" />
        </NavLink>
      )}
    </MobileContainer>
  );
}
