'use client';

/**
 * ScheduleCalendarView — 수업 일정 관리 화면 전용 월 캘린더 뷰.
 *
 * 등록된 회차(schedules)를 세로 목록 대신 월 그리드로 표시한다.
 *  · 회차가 있는 날짜에 점(ice-500) 표시.
 *  · 날짜를 탭하면 달력 바로 아래에 그날 회차 상세(시간·장소·취소 버튼)를 표시.
 *  · 취소된 일정은 부모(page)에서 이미 제외하므로 여기서는 활성 일정만 다룬다.
 *  · 추가 API 호출 없음 — 부모가 이미 보유한 schedules 를 날짜키 맵으로 가공만 한다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday } from '@/lib/calendar-week';

export interface ScheduleCalendarItem {
  id: string;
  scheduledDate: string;
  startTime?: string | null;
  endTime?: string | null;
  venue?: { id: string; name: string } | null;
}

export interface ScheduleUpdatePayload {
  startTime: string;
  endTime: string;
  venueId: string;
}

interface ScheduleCalendarViewProps {
  schedules: ScheduleCalendarItem[];
  isApproved?: boolean;
  /** 장소 선택 옵션 */
  venues?: { id: string; name: string }[];
  onCancel?: (scheduleId: string) => void;
  onUpdate?: (scheduleId: string, payload: ScheduleUpdatePayload) => void | Promise<void>;
  /** 읽기 전용 — 수정/취소 버튼·시트 미노출 (수업 상세 등 조회 화면 재사용). */
  readOnly?: boolean;
  /** 렌더 범위 — 'calendar'(달력만) | 'list'(일정 목록만) | 'both'(기본, 달력+목록).
   *  수업 상세에서 달력/목록을 별도 섹션으로 분리 배치할 때 사용. */
  part?: 'calendar' | 'list' | 'both';
}

const FIELD_CLASS =
  'w-full h-12 px-4 rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 ' +
  'text-card-meta font-semibold text-wtext-1 dark:text-white transition-colors motion-reduce:transition-none ' +
  'hover:border-ice-500 focus:outline-none focus:border-ice-500 focus:shadow-[0_0_0_3px_rgb(47_95_255_/_0.1)]';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

function dateKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 회차 시각(HH:mm) 라벨 — startTime 우선, 없으면 scheduledDate 시각 폴백. */
function timeLabel(s: ScheduleCalendarItem): string {
  if (s.startTime) return `${s.startTime}${s.endTime ? `~${s.endTime}` : ''}`;
  const d = new Date(s.scheduledDate);
  if (Number.isNaN(d.getTime())) return '-';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 날짜키("YYYY-MM-DD") → "6월 13일 (금)" 그룹 헤더 라벨. */
function groupLabelOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
}

export function ScheduleCalendarView({
  schedules,
  isApproved = false,
  venues = [],
  onCancel,
  onUpdate,
  readOnly = false,
  part = 'both',
}: ScheduleCalendarViewProps) {
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(
    () => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    [now],
  );

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based
  // 선택 날짜 — 달력 셀 강조 + 하단 목록 스크롤 타겟. 진입 시엔 미선택(전체 목록 위부터).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // 읽기 전용(수업 상세) — 과거 일정 접기. 기본 false(다가오는 일정만), 토글로 펼침.
  const [showPast, setShowPast] = useState(false);

  // 날짜 그룹 ref — 달력 셀 탭 시 해당 날짜 그룹으로 스크롤.
  const groupRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // 달력 셀 탭 → 날짜 선택. 과거 날짜면 접힌 지난 일정을 자동 펼친다(readOnly).
  //   스크롤은 아래 effect 에서 — 펼침 직후 그룹 ref 생성 타이밍을 보장.
  const handleSelectDate = (key: string) => {
    setSelectedKey(key);
    if (readOnly && key < todayKey) setShowPast(true);
  };

  // 선택 날짜(또는 펼침 상태) 변경 시 해당 그룹으로 스크롤.
  useEffect(() => {
    if (!selectedKey) return;
    groupRefs.current[selectedKey]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [selectedKey, showPast]);

  // 날짜키 → 회차[] 맵.
  const byDate = useMemo(() => {
    const map: Record<string, ScheduleCalendarItem[]> = {};
    for (const s of schedules) {
      const key = dateKeyOf(s.scheduledDate);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    // 같은 날 내에서는 시각 오름차순.
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => timeLabel(a).localeCompare(timeLabel(b)));
    });
    return map;
  }, [schedules]);

  // 42셀 그리드 (6주).
  const cells = useMemo(() => {
    const startOffset = weekColumnOf(new Date(viewYear, viewMonth, 1)); // 0=월
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const arr: { date: number | null; key: string | null; dow: number }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const dayNum = i - startOffset + 1;
      if (dayNum < 1 || dayNum > lastDay) {
        arr.push({ date: null, key: null, dow: i % 7 });
      } else {
        arr.push({
          date: dayNum,
          key: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(dayNum)}`,
          dow: i % 7,
        });
      }
    }
    return arr;
  }, [viewYear, viewMonth]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // 등록된 전체 회차를 날짜 오름차순 그룹으로. (취소 일정은 부모가 이미 제외)
  const dateGroups = useMemo(
    () => Object.keys(byDate).sort().map((key) => ({ key, items: byDate[key] })),
    [byDate],
  );
  const totalCount = schedules.length;

  // 읽기 전용 — 과거(오늘 이전) 그룹 접기용 분리. (key 는 YYYY-MM-DD 라 문자열 비교=날짜순)
  const pastGroups = dateGroups.filter((g) => g.key < todayKey);
  const upcomingGroups = dateGroups.filter((g) => g.key >= todayKey);
  const pastCount = pastGroups.reduce((sum, g) => sum + g.items.length, 0);
  const hasUpcoming = upcomingGroups.length > 0;
  // 전부 지난 일정인 수업도 다른 수업과 동일하게 기본 접고 토글로 펼친다.
  //   (다가오는 일정이 없을 때만 전체를 펼치던 예외 제거 — 동작 일관성)
  const readOnlyVisibleGroups = showPast ? dateGroups : upcomingGroups;
  const showPastToggle = pastCount > 0;

  // 개별 회차 수정 시트.
  const [editing, setEditing] = useState<ScheduleCalendarItem | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const openEdit = (s: ScheduleCalendarItem) => {
    setEditing(s);
    setEditStart(s.startTime ?? '');
    setEditEnd(s.endTime ?? '');
    setEditVenue(s.venue?.id ?? '');
  };

  const handleSave = async () => {
    if (!editing || isSaving) return;
    setIsSaving(true);
    try {
      await onUpdate?.(editing.id, { startTime: editStart, endTime: editEnd, venueId: editVenue });
      setEditing(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4">
      {part !== 'list' && (
        <>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={goPrev}
          className="size-9 flex items-center justify-center rounded-lg hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
          aria-label="이전 달"
        >
          <Icon name="chevron_left" className="text-xl text-wtext-2 dark:text-rink-100" />
        </button>
        <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button
          type="button"
          onClick={goNext}
          className="size-9 flex items-center justify-center rounded-lg hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
          aria-label="다음 달"
        >
          <Icon name="chevron_right" className="text-xl text-wtext-2 dark:text-rink-100" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7">
        {WEEKDAY_HEADERS.map((w, i) => (
          <span
            key={w}
            className={cn(
              'py-1 text-center text-w-caption font-bold',
              colIsSunday(i)
                ? 'text-flame-500'
                : colIsSaturday(i)
                  ? 'text-ice-500'
                  : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            {w}
          </span>
        ))}
      </div>

      {/* 일자 그리드 */}
      <div className="grid grid-cols-7 gap-y-1" role="grid" aria-label={`${viewYear}년 ${viewMonth + 1}월`}>
        {cells.map((cell, idx) => {
          const items = cell.key ? byDate[cell.key] ?? [] : [];
          const hasSchedule = items.length > 0;
          const isToday = cell.key === todayKey;
          const isSelected = cell.key !== null && cell.key === selectedKey;

          return (
            <button
              key={`cell-${idx}`}
              type="button"
              onClick={() => cell.key && handleSelectDate(cell.key)}
              disabled={cell.date === null}
              className={cn(
                'flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors motion-reduce:transition-none',
                cell.date === null
                  ? 'cursor-default'
                  : 'hover:bg-wline-2 active:brightness-95 dark:hover:bg-rink-700',
                isSelected && 'bg-ice-500 hover:bg-ice-700',
                isToday && !isSelected && 'ring-2 ring-inset ring-ice-500',
              )}
              aria-label={
                cell.date === null
                  ? undefined
                  : `${viewMonth + 1}월 ${cell.date}일${isToday ? ' 오늘' : ''}${
                      hasSchedule ? ` 일정 ${items.length}건` : ''
                    }`
              }
              aria-selected={isSelected}
              role="gridcell"
            >
              <span
                className={cn(
                  'tabular-nums text-card-meta font-semibold leading-none',
                  isSelected
                    ? 'text-white'
                    : cell.date === null
                      ? 'text-transparent'
                      : colIsSunday(cell.dow)
                        ? 'text-flame-500'
                        : colIsSaturday(cell.dow)
                          ? 'text-ice-500'
                          : 'text-wtext-1 dark:text-white',
                )}
              >
                {cell.date ?? ''}
              </span>
              {/* 일정 점 — 높이 reserve 로 셀 정렬 유지. */}
              <span className="flex h-1.5 items-center">
                {hasSchedule && (
                  <span
                    aria-hidden="true"
                    className={cn('size-1.5 rounded-full', isSelected ? 'bg-white' : 'bg-ice-500')}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
        </>
      )}

      {/* 등록된 전체 일정 — 날짜 오름차순 그룹. 달력 셀 탭 시 해당 날짜 그룹으로 스크롤·강조. */}
      {part !== 'calendar' && (
      <div className={cn(part === 'list' ? '' : 'mt-4 border-t border-wline-2 dark:border-rink-700 pt-4')}>
        {part !== 'list' && (
        <h3 className="mb-3 flex items-center gap-1.5 text-card-body font-bold text-wtext-1 dark:text-white">
          <Icon name="event" className="text-card-title text-ice-500" aria-hidden="true" />
          전체 일정
          <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
            {totalCount}건
          </span>
        </h3>
        )}
        {totalCount === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900 p-6">
            <Icon name="event_busy" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">등록된 일정이 없습니다.</p>
          </div>
        ) : readOnly ? (
          // 읽기 전용(수업 상세) — 날짜 그룹 헤더 + 회차(시간·장소) 들여쓰기로 위계 강조.
          //   과거 일정은 기본 접고 상단 토글로 펼친다.
          <ul
            className="rounded-xl border border-wline-2 dark:border-rink-700 overflow-hidden divide-y divide-wline-2 dark:divide-rink-700"
            role="list"
            aria-label={`등록된 일정 ${totalCount}건`}
          >
            {showPastToggle && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowPast((v) => !v)}
                  aria-expanded={showPast}
                  className="flex w-full items-center justify-center gap-1 px-3 py-2 text-card-meta font-bold text-ice-500 hover:bg-ice-500/[0.05] transition-colors motion-reduce:transition-none"
                >
                  <Icon
                    name={showPast ? 'expand_less' : 'expand_more'}
                    className="text-base"
                    aria-hidden="true"
                  />
                  {showPast ? '지난 일정 접기' : `지난 일정 ${pastCount}개 보기`}
                </button>
              </li>
            )}
            {readOnlyVisibleGroups.map(({ key, items }) => {
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              const isPast = key < todayKey;
              const dateLabel = groupLabelOf(key);
              return (
                <li
                  key={key}
                  ref={(el) => {
                    groupRefs.current[key] = el;
                  }}
                  role="listitem"
                  className={cn(
                    'px-3 py-2.5 transition-colors motion-reduce:transition-none',
                    // 지난 일정은 비활성처럼 흐린 배경 처리.
                    isPast && 'bg-wbg/70 opacity-55 dark:bg-rink-900/50',
                    isSelected && 'bg-ice-500/[0.06] opacity-100',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-card-meta font-bold tabular-nums',
                        isToday ? 'text-ice-500' : 'text-wtext-1 dark:text-white',
                      )}
                    >
                      {dateLabel}
                    </span>
                    {isToday && (
                      <span className="rounded bg-ice-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        오늘
                      </span>
                    )}
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                    {items.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-baseline gap-1.5 text-card-meta"
                      >
                        <span className="shrink-0 font-semibold text-wtext-1 dark:text-white tabular-nums">
                          {timeLabel(s)}
                        </span>
                        {s.venue?.name && (
                          <>
                            <span
                              className="shrink-0 text-wtext-4 dark:text-rink-300"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            <span className="min-w-0 truncate text-wtext-3 dark:text-rink-300">
                              {s.venue.name}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul
            className="rounded-xl border border-wline-2 dark:border-rink-700 overflow-hidden divide-y divide-wline-2 dark:divide-rink-700"
            role="list"
            aria-label={`등록된 일정 ${totalCount}건`}
          >
            {dateGroups.map(({ key, items }) => {
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              const dateLabel = groupLabelOf(key);
              return (
                <li
                  key={key}
                  ref={(el) => {
                    groupRefs.current[key] = el;
                  }}
                  className={cn(
                    'transition-colors motion-reduce:transition-none',
                    isSelected && 'bg-ice-500/[0.06]',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5',
                      isSelected ? 'bg-ice-500/10' : 'bg-wbg dark:bg-rink-900',
                    )}
                  >
                    <span className="text-w-caption font-bold text-wtext-1 dark:text-white tabular-nums">
                      {dateLabel}
                    </span>
                    {isToday && (
                      <span className="rounded bg-ice-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        오늘
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-wline-2 dark:divide-rink-700" role="list">
                    {items.map((s) => (
                      <li
                        key={s.id}
                        role="listitem"
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-card-meta font-semibold text-wtext-1 dark:text-white tabular-nums shrink-0">
                            {timeLabel(s)}
                          </span>
                          {s.venue?.name && (
                            <span className="text-w-caption text-wtext-3 dark:text-rink-300 truncate">
                              {s.venue.name}
                            </span>
                          )}
                        </div>
                        {!readOnly && isApproved && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              className="text-card-meta font-bold text-ice-500 hover:text-ice-700 px-2 py-1 rounded transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
                              aria-label={`${dateLabel} ${timeLabel(s)} 회차 수정하기`}
                            >
                              수정하기
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancel?.(s.id)}
                              className="text-card-meta font-bold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1 rounded transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none"
                              aria-label={`${dateLabel} ${timeLabel(s)} 회차 취소하기`}
                            >
                              취소하기
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

      {/* 개별 회차 시간·장소 수정 시트 */}
      <BottomSheet
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="회차 수정"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-bold"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-11 rounded-xl bg-ice-500 text-white font-bold disabled:opacity-50"
            >
              {isSaving ? '저장 중…' : '저장하기'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-w-caption font-bold text-wtext-3 dark:text-rink-300">시작 시간</label>
              <input
                type="time"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className={`${FIELD_CLASS} tabular-nums`}
                aria-label="시작 시간"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-w-caption font-bold text-wtext-3 dark:text-rink-300">종료 시간</label>
              <input
                type="time"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className={`${FIELD_CLASS} tabular-nums`}
                aria-label="종료 시간"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-w-caption font-bold text-wtext-3 dark:text-rink-300">장소</label>
            <select
              value={editVenue}
              onChange={(e) => setEditVenue(e.target.value)}
              className={FIELD_CLASS}
              aria-label="장소"
            >
              <option value="">장소 선택 안 함</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

export default ScheduleCalendarView;
