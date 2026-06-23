'use client';

/**
 * MultiDatePickerModal — 복수 날짜 선택 미니달력 (공통 BottomSheet 기반).
 *
 * [2026-06-09] 오픈클래스 일정 등록 — 여러 날짜를 한 번에 선택 + 공통 시간/장소 입력 → 일정 일괄 생성.
 *  · 날짜 클릭 = 선택 토글(복수). 시작/종료 시간 + 장소(선택)를 공통으로 입력.
 *  · 확인 시 onConfirm(선택 날짜 배열, 공통 시간/장소) 전달.
 *  · new Date()(argless) 금지 환경 — 모든 날짜 계산은 인자 있는 new Date(y, m, d) 사용.
 *
 * [2026-06-10] 자체 오버레이 셸을 공통 BottomSheet 로 교체 — 다른 시트들과 애니메이션·dim·
 *  네이티브 scrim·z-index·ESC·스크롤락을 일치시킨다. 달력/공통입력 로직·외부 인터페이스는 불변.
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { WEEKDAY_HEADERS, weekColumnOf } from '@/lib/calendar-week';

export interface MultiDateCommon {
  startTime: string;
  endTime: string;
  venueId: string;
  venueName: string;
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
  /** 장소 선택 옵션 */
  venues: { id: string; name: string }[];
  /** 확인 시 선택된 날짜 배열(오름차순) + 공통 시간/장소 전달 */
  onConfirm: (dates: string[], common: MultiDateCommon) => void;
  onClose: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const WEEKDAYS = WEEKDAY_HEADERS;

// 공통 TimePicker 트리거 버튼과 동일한 시각 토큰 — 시트 중첩 없이 시각만 통일(옵션 A).
const FIELD_CLASS =
  'w-full h-12 px-4 rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 ' +
  'text-card-meta font-semibold text-wtext-1 dark:text-white transition-colors motion-reduce:transition-none ' +
  'hover:border-ice-500 focus:outline-none focus:border-ice-500 focus:shadow-[0_0_0_3px_rgb(47_95_255_/_0.1)]';

export function MultiDatePickerModal({
  isOpen,
  initialYear,
  initialMonth,
  selected,
  disabledDates,
  venues,
  onConfirm,
  onClose,
}: MultiDatePickerModalProps) {
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth); // 1-12
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));
  const disabledSet = useMemo(() => new Set(disabledDates ?? []), [disabledDates]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venueId, setVenueId] = useState('');
  // [2026-06-18] 장소 '찾아보기' — 텍스트 입력 시 저장된 장소를 필터링해 선택(팀 찾아보기 패턴).
  const [venueQuery, setVenueQuery] = useState('');
  const filteredVenues = useMemo(() => {
    const q = venueQuery.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) => v.name.toLowerCase().includes(q));
  }, [venueQuery, venues]);

  // 열릴 때 표시 월을 현재 년월로 동기화 — 서버 기준 연/월(initialYear/Month) 우선,
  //   미로딩/무효 시 클라이언트 현재 날짜로 폴백(항상 현재 월 달력이 열리도록 보장).
  useEffect(() => {
    if (isOpen) {
      setPicked(new Set(selected));
      setStartTime('');
      setEndTime('');
      setVenueId('');
      setVenueQuery('');
      const now = new Date();
      setViewYear(initialYear > 0 ? initialYear : now.getFullYear());
      setViewMonth(
        initialMonth >= 1 && initialMonth <= 12 ? initialMonth : now.getMonth() + 1,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialYear, initialMonth]);

  // 월 그리드 셀 (null = 빈칸).
  const cells = useMemo(() => {
    const firstWeekday = weekColumnOf(new Date(viewYear, viewMonth - 1, 1)); // 0=월
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) arr.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) arr.push(d);
    return arr;
  }, [viewYear, viewMonth]);

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
  const toggle = (d: number) => {
    const key = toISO(viewYear, viewMonth, d);
    if (disabledSet.has(key)) return; // 이미 등록된 날짜는 토글 불가
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm([...picked].sort(), {
      startTime,
      endTime,
      venueId,
      venueName: venues.find((v) => v.id === venueId)?.name ?? '',
    });
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
            className="flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-bold"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 h-11 rounded-xl bg-ice-500 text-white font-bold disabled:opacity-50"
            disabled={picked.size === 0}
          >
            {picked.size > 0 ? `${picked.size}개 일정 추가` : '날짜를 선택하세요'}
          </button>
        </div>
      }
    >
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
          <span key={w} className="text-w-caption font-bold text-wtext-3 dark:text-rink-300 py-1">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const iso = toISO(viewYear, viewMonth, d);
          const isPicked = picked.has(iso);
          const isDisabled = disabledSet.has(iso);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => toggle(d)}
              disabled={isDisabled}
              aria-pressed={isPicked}
              aria-label={isDisabled ? `${viewMonth}월 ${d}일 이미 등록됨` : undefined}
              className={`h-9 rounded-lg text-w-small font-bold tabular-nums transition-colors motion-reduce:transition-none ${
                isDisabled
                  ? 'bg-wline-2 dark:bg-rink-700 text-wtext-4 dark:text-rink-500 line-through cursor-not-allowed'
                  : isPicked
                    ? 'bg-ice-500 text-white'
                    : 'text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-700'
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      {disabledSet.size > 0 && (
        <p className="mt-2 text-w-caption text-wtext-3 dark:text-rink-300">
          회색 날짜는 이미 등록된 일정이라 선택할 수 없습니다.
        </p>
      )}

      {/* 공통 시간/장소 */}
      <div className="mt-4 space-y-3 border-t border-wline-2 dark:border-rink-700 pt-3">
        <p className="text-w-caption font-bold text-wtext-3 dark:text-rink-300">
          선택한 날짜에 공통 적용 (개별 수정은 일정 목록에서)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-w-caption font-bold text-wtext-3 dark:text-rink-300">시작 시간</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${FIELD_CLASS} tabular-nums`}
              aria-label="공통 시작 시간"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-w-caption font-bold text-wtext-3 dark:text-rink-300">종료 시간</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${FIELD_CLASS} tabular-nums`}
              aria-label="공통 종료 시간"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-w-caption font-bold text-wtext-3 dark:text-rink-300">장소</label>
          {/* [2026-06-18] 장소 찾아보기 — 텍스트 입력 시 저장된 장소가 필터링되어 표시. 선택 시 확정. */}
          <input
            type="text"
            value={venueQuery}
            onChange={(e) => {
              setVenueQuery(e.target.value);
              if (venueId) setVenueId('');
            }}
            placeholder="장소 찾아보기"
            className={FIELD_CLASS}
            aria-label="공통 장소 검색"
          />
          {venueId ? (
            <button
              type="button"
              onClick={() => {
                setVenueId('');
                setVenueQuery('');
              }}
              className="mt-1 inline-flex items-center gap-1 text-w-caption font-semibold text-wtext-3 dark:text-rink-300 underline"
            >
              선택 해제 (장소 미지정)
            </button>
          ) : venueQuery.trim() ? (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-wline-2 dark:border-rink-700 divide-y divide-wline-2 dark:divide-rink-700">
              {filteredVenues.length > 0 ? (
                filteredVenues.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setVenueId(v.id);
                        setVenueQuery(v.name);
                      }}
                      className="w-full px-3 py-2.5 text-left text-w-body font-medium text-wtext-1 dark:text-white hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none"
                    >
                      {v.name}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2.5 text-w-caption text-wtext-3 dark:text-rink-300">
                  &ldquo;{venueQuery.trim()}&rdquo; 검색 결과가 없습니다
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-w-caption text-wtext-3 dark:text-rink-300">
              장소명을 입력하면 저장된 장소가 표시됩니다. 비워두면 장소 미지정.
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
