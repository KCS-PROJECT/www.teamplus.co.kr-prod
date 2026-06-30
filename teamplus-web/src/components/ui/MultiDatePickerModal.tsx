'use client';

/**
 * MultiDatePickerModal — 복수 날짜 선택 미니달력 (공통 BottomSheet 기반).
 *
 * [2026-06-30 재설계 §9] 요일 우선 흐름 — 상단 "요일 빠른 선택" 칩으로 보고 있는 달(viewMonth)의
 *  해당 요일 날짜를 일괄 추가/제거(토글)한다. 이미 등록된 날짜·지난 날짜는 제외. 월을 넘기며 누적.
 *  달력은 미세조정 전용(특정 날짜 개별 해제/추가). 하단 공통 시간/장소 입력·적용 토글은 제거.
 *  확인 시 각 날짜에 요일 기본값(시간/장소)을 주입(resolved), 기본값 없는 요일은 빈 시간으로 생성
 *  → 일정 목록 아코디언에서 개별 수정.
 *  · new Date()(argless) 금지 환경 — 요일/일수 계산은 인자 있는 new Date(y, m, d) 사용.
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { WEEKDAY_HEADERS, weekColumnOf } from '@/lib/calendar-week';
import { MESSAGES } from '@/lib/messages';

/** 확인 시 날짜별로 확정된 시간·장소 — 요일 기본값 있으면 그 값, 없으면 빈 시간(개별 수정 유도). */
export interface MultiDateResolved {
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  venueId: string;
  venueName: string;
}

/** 요일별 기본값(ClassDaySchedule 템플릿) — 칩 표시·주입에 사용. dayOfWeek 한글 SoT("월"~"일"). */
export interface MultiDateDayDefault {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  venueId?: string | null;
  venueName?: string | null;
}

interface MultiDatePickerModalProps {
  isOpen: boolean;
  /** 초기 표시 연도 (예: 2026) */
  initialYear: number;
  /** 초기 표시 월 (1-12) */
  initialMonth: number;
  /** 이미 선택된 날짜 (YYYY-MM-DD) */
  selected: string[];
  /** 선택 불가(이미 등록됨) 날짜 (YYYY-MM-DD) — 회색·토글 차단 */
  disabledDates?: string[];
  /** 수업의 요일별 기본값 — 시간 입력된 요일만 "요일 빠른 선택" 칩으로 노출. */
  daySchedules?: MultiDateDayDefault[];
  /** 확인 시 선택 날짜 배열(오름차순) + 날짜별 확정 결과 전달.
   *  resolved: 각 날짜 요일에 기본값이 있으면 그 시간/장소, 없으면 빈 시간이 주입된 목록(dates 동일 순서). */
  onConfirm: (dates: string[], resolved: MultiDateResolved[]) => void;
  onClose: () => void;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰(파랑 선택칩·it-fill 입력)으로 교체.
   */
  iceTheme?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const WEEKDAYS = WEEKDAY_HEADERS;

// 한글 요일 — toISO 결과("YYYY-MM-DD")에서 요일 기본값 매칭에 사용(한글 SoT). TZ 시프트 방지로 로컬 파싱.
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const weekdayKoOf = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return KO_WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? '';
};
// 칩 정렬용 요일 순서(월 시작).
const DAY_ORDER: Record<string, number> = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };

export function MultiDatePickerModal({
  isOpen,
  initialYear,
  initialMonth,
  selected,
  disabledDates,
  daySchedules,
  onConfirm,
  onClose,
  iceTheme = false,
}: MultiDatePickerModalProps) {
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth); // 1-12
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));
  const disabledSet = useMemo(() => new Set(disabledDates ?? []), [disabledDates]);

  // 오늘(로컬) ISO — 지난 날짜 제외 비교용(YYYY-MM-DD 문자열 비교로 충분).
  const todayISO = useMemo(() => {
    const now = new Date();
    return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, []);

  // 요일별 기본값(시간 입력된 행만) — 칩·주입 대상. 요일 순 정렬.
  const validDayDefaults = useMemo(
    () =>
      (daySchedules ?? [])
        .filter((s) => s.startTime && s.endTime)
        .sort((a, b) => (DAY_ORDER[a.dayOfWeek] ?? 99) - (DAY_ORDER[b.dayOfWeek] ?? 99)),
    [daySchedules],
  );

  // 열릴 때 표시 월을 현재 년월로 동기화 — 서버 기준 연/월(initialYear/Month) 우선,
  //   미로딩/무효 시 클라이언트 현재 날짜로 폴백(항상 현재 월 달력이 열리도록 보장).
  useEffect(() => {
    if (isOpen) {
      setPicked(new Set(selected));
      const now = new Date();
      setViewYear(initialYear > 0 ? initialYear : now.getFullYear());
      setViewMonth(
        initialMonth >= 1 && initialMonth <= 12 ? initialMonth : now.getMonth() + 1,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialYear, initialMonth]);

  // 월 그리드 셀 (null = 빈칸). 항상 6주(42칸) 고정 — 달마다 주 수가 달라도
  //   그리드(=시트) 높이가 출렁이지 않도록 뒤를 빈칸으로 채운다.
  const cells = useMemo(() => {
    const firstWeekday = weekColumnOf(new Date(viewYear, viewMonth - 1, 1)); // 0=월
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) arr.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) arr.push(d);
    while (arr.length < 42) arr.push(null); // 6주 고정(높이 안정화)
    return arr;
  }, [viewYear, viewMonth]);

  // 보고 있는 달에서 특정 요일의 선택 가능 날짜(이미 등록됨·지난 날짜 제외).
  const chipDatesOfMonth = (dayOfWeek: string): string[] => {
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const result: string[] = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = toISO(viewYear, viewMonth, d);
      if (weekdayKoOf(iso) !== dayOfWeek) continue;
      if (disabledSet.has(iso)) continue; // 이미 등록된 날짜 제외
      if (iso < todayISO) continue; // 지난 날짜 제외
      result.push(iso);
    }
    return result;
  };

  const goPrev = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // 달력 개별 토글 — 미세조정용. 이미 등록·지난 날짜는 칩과 동일하게 선택 불가.
  const toggle = (d: number) => {
    const key = toISO(viewYear, viewMonth, d);
    if (disabledSet.has(key) || key < todayISO) return; // 이미 등록·지난 날짜는 토글 불가
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 요일 칩 탭 — 보고 있는 달의 해당 요일을 일괄 토글(전부 선택돼 있으면 일괄 해제).
  //   다른 달 선택분·개별 추가분은 picked Set 그대로 보존(월 이동 누적).
  const toggleChip = (dayOfWeek: string) => {
    const dates = chipDatesOfMonth(dayOfWeek);
    if (dates.length === 0) return;
    setPicked((prev) => {
      const next = new Set(prev);
      const allPicked = dates.every((d) => next.has(d));
      if (allPicked) dates.forEach((d) => next.delete(d));
      else dates.forEach((d) => next.add(d));
      return next;
    });
  };

  const handleConfirm = () => {
    const sortedDates = [...picked].sort();
    // 날짜별 확정값 — 요일 기본값이 있으면 그 시간/장소, 없으면 빈 시간(일정 목록 개별 수정 유도).
    const resolved: MultiDateResolved[] = sortedDates.map((date) => {
      const def = validDayDefaults.find((s) => s.dayOfWeek === weekdayKoOf(date));
      if (def) {
        return {
          date,
          startTime: def.startTime,
          endTime: def.endTime,
          venueId: def.venueId ?? '',
          venueName: def.venueName ?? '',
        };
      }
      return { date, startTime: '', endTime: '', venueId: '', venueName: '' };
    });
    onConfirm(sortedDates, resolved);
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="날짜 선택"
      maxHeight="90vh"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={
              iceTheme
                ? 'flex-1 h-11 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-rink-100 font-bold transition-colors motion-reduce:transition-none active:brightness-95'
                : 'flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-bold'
            }
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={
              iceTheme
                ? 'flex-1 h-11 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold disabled:opacity-50 transition-colors motion-reduce:transition-none active:brightness-95'
                : 'flex-1 h-11 rounded-xl bg-ice-500 text-white font-bold disabled:opacity-50'
            }
            disabled={picked.size === 0}
          >
            {picked.size > 0 ? `${picked.size}개 일정 추가` : '날짜를 선택하세요'}
          </button>
        </div>
      }
    >
      {/* 요일 빠른 선택 칩 — 시간 입력된 요일 기본값이 있을 때만 노출.
          탭하면 보고 있는 달의 해당 요일 전부 일괄 선택/해제. */}
      {validDayDefaults.length > 0 && (
        <div className="pb-3 mb-1 border-b border-wline-2 dark:border-rink-700">
          <p
            className={
              iceTheme
                ? 'mb-2 text-w-caption font-bold text-it-ink-500 dark:text-rink-300'
                : 'mb-2 text-w-caption font-bold text-wtext-3 dark:text-rink-300'
            }
          >
            {MESSAGES.class.dayDefaults.quickSelect}
          </p>
          <div className="flex flex-wrap gap-2">
            {validDayDefaults.map((s) => {
              const dates = chipDatesOfMonth(s.dayOfWeek);
              const active = dates.length > 0 && dates.every((d) => picked.has(d));
              const disabled = dates.length === 0;
              return (
                <button
                  key={s.dayOfWeek}
                  type="button"
                  onClick={() => toggleChip(s.dayOfWeek)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={cnChip(iceTheme, active, disabled)}
                >
                  <span className="font-extrabold">{s.dayOfWeek}</span>
                </button>
              );
            })}
          </div>
          <p
            className={
              iceTheme
                ? 'mt-2 text-w-caption text-it-ink-500 dark:text-rink-300 leading-relaxed'
                : 'mt-2 text-w-caption text-wtext-3 dark:text-rink-300 leading-relaxed'
            }
          >
            {MESSAGES.class.dayDefaults.quickSelectHint}
          </p>
        </div>
      )}

      {/* 월 네비 */}
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={goPrev}
          className="size-9 flex items-center justify-center rounded-lg hover:bg-wline-2 dark:hover:bg-rink-700"
          aria-label="이전 달"
        >
          <Icon name="chevron_left" className="text-xl text-wtext-2 dark:text-rink-100" />
        </button>
        <span className="text-w-small font-bold text-wtext-1 dark:text-white tabular-nums">
          {viewYear}년 {viewMonth}월
        </span>
        <button
          type="button"
          onClick={goNext}
          className="size-9 flex items-center justify-center rounded-lg hover:bg-wline-2 dark:hover:bg-rink-700"
          aria-label="다음 달"
        >
          <Icon name="chevron_right" className="text-xl text-wtext-2 dark:text-rink-100" />
        </button>
      </div>

      {/* 그리드 */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className={
              iceTheme
                ? 'text-w-caption font-bold text-it-ink-500 dark:text-rink-300 py-1'
                : 'text-w-caption font-bold text-wtext-3 dark:text-rink-300 py-1'
            }
          >
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const iso = toISO(viewYear, viewMonth, d);
          const isPicked = picked.has(iso);
          const isPast = iso < todayISO;
          const isDisabled = disabledSet.has(iso) || isPast;
          const cellClass = iceTheme
            ? isDisabled
              ? 'bg-it-fill dark:bg-rink-700 text-it-ink-300 dark:text-rink-500 line-through cursor-not-allowed'
              : isPicked
                ? 'bg-it-blue-500 text-white'
                : 'text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-700'
            : isDisabled
              ? 'bg-wline-2 dark:bg-rink-700 text-wtext-4 dark:text-rink-500 line-through cursor-not-allowed'
              : isPicked
                ? 'bg-ice-500 text-white'
                : 'text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-700';
          return (
            <button
              key={iso}
              type="button"
              onClick={() => toggle(d)}
              disabled={isDisabled}
              aria-pressed={isPicked}
              aria-label={isDisabled ? `${viewMonth}월 ${d}일 ${isPast ? '지난 날짜' : '이미 등록됨'}` : undefined}
              className={`h-9 rounded-lg text-w-small font-bold tabular-nums transition-colors motion-reduce:transition-none ${cellClass}`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-w-caption text-wtext-3 dark:text-rink-300">
        {MESSAGES.class.dayDefaults.dateRestrictHint}
      </p>
    </BottomSheet>
  );
}

// 요일 칩 클래스 — iceTheme/활성/비활성 분기. 솔리드 컬러만(그라디언트·블러 금지).
function cnChip(iceTheme: boolean, active: boolean, disabled: boolean): string {
  const base =
    'inline-flex items-center gap-1.5 px-3 h-9 rounded-w-pill border-[1.5px] text-w-caption font-bold transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed';
  if (iceTheme) {
    return `${base} ${
      active
        ? 'bg-it-blue-500 border-it-blue-500 text-white'
        : 'bg-it-fill dark:bg-rink-700 border-it-line-strong dark:border-rink-600 text-it-ink-700 dark:text-rink-100'
    }`;
  }
  return `${base} ${
    active
      ? 'bg-ice-500 border-ice-500 text-white'
      : 'bg-wbg dark:bg-rink-700 border-wline-2 dark:border-rink-600 text-wtext-2 dark:text-rink-100'
  }`;
}
