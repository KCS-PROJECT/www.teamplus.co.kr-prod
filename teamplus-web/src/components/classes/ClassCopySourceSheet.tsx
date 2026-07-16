'use client';

/**
 * ClassCopySourceSheet — "기존 수업 불러오기" 원본 선택 바텀시트
 *
 * 신규 수업 등록 화면에서 열림. 내 관리 수업(팀 정규 / 오픈클래스) 목록을 최소 메타
 * (수업명 · 유형 · 요일)로 보여주고, 행 선택 시 onSelect(classId) 로 copyFrom prefill 을
 * 트리거한다. 목록은 시트 최초 오픈 시 lazy fetch (등록 페이지 초기 로딩 무영향).
 * 종료된 수업(lifecycleStatus=ENDED · 기간 경과)은 목록에서 제외한다.
 *
 * SoT: DESIGN.md §7(절대 금지) — gradient/backdrop-blur/컬러 그림자 0건, it-* 토큰만.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';

export interface ClassCopySourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** true=오픈클래스(academy) 모드, false=팀 모드. 목록 데이터 소스 분기. */
  isAcademyMode: boolean;
  onSelect: (classId: string) => void;
}

interface CopySourceItem {
  id: string;
  title: string;
  typeLabel: string;
  dayLabels: string[];
}

type SheetStatus = 'idle' | 'loading' | 'list' | 'empty' | 'error';

// 요일 표기 정규화(EN/KR 혼재 → 한글) + 월요일 시작 정렬 — 목록 페이지와 동일 컨벤션.
const DAY_NORMALIZE_MAP: Record<string, string> = {
  '일': '일', '월': '월', '화': '화', '수': '수', '목': '목', '금': '금', '토': '토',
  SUN: '일', SUNDAY: '일', MON: '월', MONDAY: '월',
  TUE: '화', TUES: '화', TUESDAY: '화', WED: '수', WEDNESDAY: '수',
  THU: '목', THUR: '목', THURSDAY: '목', FRI: '금', FRIDAY: '금',
  SAT: '토', SATURDAY: '토',
};
const DAY_ORDER_MON_FIRST: Record<string, number> = {
  '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6,
};

function normalizeDays(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const days = input
    .map((d) => {
      const t = String(d ?? '').trim();
      return DAY_NORMALIZE_MAP[t] ?? DAY_NORMALIZE_MAP[t.toUpperCase()] ?? '';
    })
    .filter((d): d is string => Boolean(d));
  const uniq = Array.from(new Set(days));
  uniq.sort((a, b) => (DAY_ORDER_MON_FIRST[a] ?? 99) - (DAY_ORDER_MON_FIRST[b] ?? 99));
  return uniq;
}

function toDateOnly(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 종료 판정 — 목록 페이지 resolveStatus 의 ENDED 조건과 정합(파생상태 우선, 없으면 기간 역산).
function isEndedClass(c: Record<string, unknown>): boolean {
  const lifecycle = c.lifecycleStatus as string | null | undefined;
  if (lifecycle === 'ENDED') return true;
  if (lifecycle == null) {
    const end = toDateOnly(
      (c.lastScheduleDate as string | null) ?? (c.firstScheduleDate as string | null) ?? null,
    );
    if (end) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return end.getTime() < today.getTime();
    }
  }
  return false;
}

function deriveDayLabels(c: Record<string, unknown>): string[] {
  const fromDaySchedules = Array.isArray(c.daySchedules)
    ? (c.daySchedules as Array<{ dayOfWeek?: string }>).map((s) => s?.dayOfWeek ?? '')
    : [];
  const normalized = normalizeDays(fromDaySchedules);
  if (normalized.length > 0) return normalized;
  return normalizeDays(c.classDays);
}

export function ClassCopySourceSheet({
  isOpen,
  onClose,
  isAcademyMode,
  onSelect,
}: ClassCopySourceSheetProps) {
  const [status, setStatus] = useState<SheetStatus>('idle');
  const [items, setItems] = useState<CopySourceItem[]>([]);
  // 최초 1회만 fetch — 재오픈 시 캐시 재사용(등록 페이지 초기 로딩과 무관한 lazy 로딩).
  const fetchedRef = useRef(false);

  const fetchSources = useCallback(async () => {
    setStatus('loading');
    try {
      const raw: Record<string, unknown>[] = [];

      if (isAcademyMode) {
        const acadRes = await api.get<
          { data?: Array<{ id: string }> } | Array<{ id: string }>
        >('/academies/my/list');
        if (!acadRes.success || !acadRes.data) {
          setStatus('error');
          return;
        }
        const list = Array.isArray(acadRes.data)
          ? acadRes.data
          : ((acadRes.data as { data?: Array<{ id: string }> }).data ?? []);
        const ids = list.map((a) => a.id);
        if (ids.length === 0) {
          setItems([]);
          setStatus('empty');
          return;
        }
        const results = await Promise.all(
          ids.map((id) =>
            api.get<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>(
              `/academies/${id}/classes`,
            ),
          ),
        );
        let anySuccess = false;
        for (const res of results) {
          if (!res.success || !res.data) continue;
          anySuccess = true;
          const classList = Array.isArray(res.data)
            ? res.data
            : ((res.data as { data?: Record<string, unknown>[] }).data ?? []);
          raw.push(...classList);
        }
        if (!anySuccess) {
          setStatus('error');
          return;
        }
      } else {
        const teamsRes = await api.get<Array<{ id: string }>>('/teams/managed/list');
        if (!teamsRes.success || !Array.isArray(teamsRes.data)) {
          setStatus('error');
          return;
        }
        const ids = teamsRes.data.map((t) => t.id);
        if (ids.length === 0) {
          setItems([]);
          setStatus('empty');
          return;
        }
        const results = await Promise.all(
          ids.map((id) => api.get<Record<string, unknown>[]>(`/teams/${id}/classes`)),
        );
        let anySuccess = false;
        for (const res of results) {
          if (res.success && Array.isArray(res.data)) {
            anySuccess = true;
            raw.push(...res.data);
          }
        }
        if (!anySuccess) {
          setStatus('error');
          return;
        }
      }

      // 대회 제외 + 종료 제외 + 중복 제거 후 최소 메타 매핑.
      const seen = new Set<string>();
      const mapped: CopySourceItem[] = [];
      for (const c of raw) {
        const id = c.id as string | undefined;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const tt = String(c.trainingType ?? '').toLowerCase();
        if (tt === 'tournament') continue;
        if (isEndedClass(c)) continue;
        mapped.push({
          id,
          title: (c.className as string) ?? (c.title as string) ?? '',
          typeLabel:
            tt === 'lesson' || tt === 'academy_lesson' || tt === 'game_lesson'
              ? MESSAGES.classesEdit.copySheet.typeOpen
              : MESSAGES.classesEdit.copySheet.typeRegular,
          dayLabels: deriveDayLabels(c),
        });
      }
      setItems(mapped);
      setStatus(mapped.length > 0 ? 'list' : 'empty');
    } catch {
      setStatus('error');
    }
  }, [isAcademyMode]);

  useEffect(() => {
    if (!isOpen || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchSources();
  }, [isOpen, fetchSources]);

  const handleRetry = useCallback(() => {
    fetchSources();
  }, [fetchSources]);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.classesEdit.copySheet.title}
      maxHeight="75vh"
    >
      {status === 'loading' || status === 'idle' ? (
        <div className="py-12 flex flex-col items-center gap-3" role="status" aria-live="polite">
          <span
            className="w-8 h-8 rounded-full border-[3px] border-it-line border-t-it-blue-500 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.classesEdit.copySheet.loading}
          </p>
        </div>
      ) : status === 'error' ? (
        <div className="py-12 flex flex-col items-center gap-3" role="alert" aria-live="polite">
          <div className="w-14 h-14 rounded-w-pill bg-it-red-50 dark:bg-it-red-700/20 flex items-center justify-center" aria-hidden="true">
            <Icon name="error_outline" className="text-2xl text-it-red-500 dark:text-it-red-300" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.classesEdit.copySheet.loadFailed}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-2 text-card-body font-semibold text-it-blue-500 bg-it-blue-500/10 rounded-w-md hover:bg-it-blue-500/20 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            {MESSAGES.dashboard.errorRetry}
          </button>
        </div>
      ) : status === 'empty' ? (
        <div className="py-12 flex flex-col items-center gap-3" role="status" aria-live="polite">
          <div className="w-14 h-14 rounded-w-pill bg-it-fill dark:bg-rink-700 flex items-center justify-center" aria-hidden="true">
            <Icon name="inbox" className="text-2xl text-it-ink-400 dark:text-rink-300" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.classesEdit.copySheet.empty}
          </p>
        </div>
      ) : (
        <ul className="space-y-2 py-1" role="list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="w-full flex items-center gap-3 p-4 rounded-w-md border border-it-line dark:border-rink-700 bg-it-surface dark:bg-rink-800 hover:bg-it-fill dark:hover:bg-rink-700 text-left transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
              >
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-card-body font-semibold text-it-ink-900 dark:text-white truncate">
                    {item.title}
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-card-meta font-bold px-2 py-0.5 rounded bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-500 shrink-0">
                      {item.typeLabel}
                    </span>
                    <span className="text-card-meta text-it-ink-500 dark:text-rink-300 truncate">
                      {item.dayLabels.length > 0
                        ? item.dayLabels.join(' · ')
                        : MESSAGES.classesEdit.copySheet.noSchedule}
                    </span>
                  </span>
                </span>
                <Icon
                  name="chevron_right"
                  className="text-xl text-it-ink-400 dark:text-rink-500 shrink-0"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}

export default ClassCopySourceSheet;
