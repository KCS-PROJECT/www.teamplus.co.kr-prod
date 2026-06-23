'use client';

/**
 * EnrolledTrainingSection — 학부모 통합 캘린더 상단 '등록훈련' 섹션 (2026-06-18 신규).
 *
 * 각 자녀마다 '등록완료(결제/수강 중)'된 수업만 카드로 노출한다.
 * 카드 형태는 수업목록 페이지(classes/page.tsx DefaultClassCard)와 동일하게 ClassListCard 기반 +
 * '등록완료' 칩으로 통일한다. (해당 페이지의 소형 일정 포맷 헬퍼를 동일 컨벤션으로 재현)
 */

import { useEffect, useMemo, useState } from 'react';
import { ClassListCard, ClassCardInfoRow } from '@/components/classes/ClassListCard';
import {
  TRAINING_TYPE_LABEL,
  formatDaySchedulesShort,
  type DaySchedule,
} from '@/lib/class-categories';
import { api } from '@/services/api-client';
import { useChildren } from '@/hooks/useChildren';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { isActiveEnrollment } from '@/lib/enrollment-visibility';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

// ── 수업목록 카드에 필요한 최소 필드 (classes/page.tsx ClassItem 의 부분집합) ──
interface EnrolledClassItem {
  id: string;
  className: string;
  trainingType: string;
  classDays?: string[];
  daySchedules?: DaySchedule[];
  scheduledDates?: string[];
  scheduleTimeLabel?: string | null;
  startTime?: string;
  endTime?: string;
}

interface EnrollmentRow {
  childId?: string;
  classId?: string;
  status?: string;
  child?: { id?: string } | null;
  class?: { id?: string; billingMode?: string } | null;
}

// ── 일정 라벨 포맷 — classes/page.tsx 와 동일 컨벤션 (소형 재현) ──
function formatClassTime(start?: string, end?: string): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  // naive timestamp(UTC 역직렬화) → 입력 벽시계 시각 유지를 위해 UTC 추출.
  const fmt = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${fmt(s)} - ${fmt(e)}`;
}

function formatClassDays(days?: string[]): string | null {
  if (!days || days.length === 0) return null;
  if (days.length === 7) return '매일';
  if (days.length === 5 && ['월', '화', '수', '목', '금'].every((d) => days.includes(d)))
    return '평일';
  if (days.length === 2 && days.includes('토') && days.includes('일')) return '주말';
  return `매주 ${days.join('·')}`;
}

function formatOpenClassDates(dates?: string[]): string | null {
  if (!dates || dates.length === 0) return null;
  const parsed = [...dates]
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (parsed.length === 0) return null;
  const first = parsed[0];
  const yy = String(first.getFullYear()).slice(2);
  const mm = String(first.getMonth() + 1).padStart(2, '0');
  const days = parsed.map((d) => String(d.getDate()).padStart(2, '0'));
  return `${yy}.${mm}.${days.join(',')}`;
}

function formatScheduleLabel(item: EnrolledClassItem): string | null {
  if (item.trainingType === 'lesson') return formatOpenClassDates(item.scheduledDates);
  return formatClassDays(item.classDays);
}

function scheduleLineOf(item: EnrolledClassItem): string | null {
  const dayScheduleLabel = formatDaySchedulesShort(item.daySchedules);
  const time = dayScheduleLabel
    ? null
    : item.trainingType === 'lesson'
      ? item.scheduleTimeLabel ?? null
      : formatClassTime(item.startTime, item.endTime);
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);
  if (!daysLabel && !time) return null;
  return `${daysLabel || time}${daysLabel && time ? ` · ${time}` : ''}`;
}

// ── 등록완료 수업 카드 — 수업목록 DefaultClassCard 와 동일 ClassListCard 형태 ──
function EnrolledClassCard({ item }: { item: EnrolledClassItem }) {
  const scheduleLine = scheduleLineOf(item);
  const typeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  return (
    <ClassListCard
      href={`/classes/${item.id}`}
      trainingType={item.trainingType}
      typeBadgeLabel={typeLabel}
      ariaLabel={`${item.className} 수업 상세 보기`}
      title={item.className}
      bodyAction={
        <div className="flex items-center justify-end">
          <span
            className="inline-flex items-center justify-center min-w-[72px] h-[30px] px-3.5 rounded-full text-[14px] leading-[1.55] font-extrabold tracking-[-0.01em] bg-emerald-500 text-white"
            aria-hidden="true"
          >
            등록완료
          </span>
        </div>
      }
    >
      {scheduleLine && <ClassCardInfoRow icon="schedule">{scheduleLine}</ClassCardInfoRow>}
    </ClassListCard>
  );
}

function normalizeClassList(
  data: EnrolledClassItem[] | { data?: EnrolledClassItem[] } | undefined,
): EnrolledClassItem[] {
  const list = Array.isArray(data) ? data : data?.data;
  return Array.isArray(list) ? list : [];
}

export function EnrolledTrainingSection() {
  const { selectableChildren } = useChildren();
  // [2026-06-19 사용자 직접 지시] 등록훈련은 현재 선택된 자녀(홈/전체메뉴 선택) 기준으로만 노출.
  const { selectedChildId } = useSelectedChild();

  // 현재 선택된 자녀만 노출 (선택값 없으면 안전망으로 전체 — 보통 컨텍스트가 첫 자녀 자동 선택).
  const children = useMemo(() => {
    const yearOf = (c: { birthDate?: string | null }) =>
      c.birthDate ? new Date(c.birthDate).getFullYear() : Number.POSITIVE_INFINITY;
    const sorted = [...selectableChildren].sort((a, b) => yearOf(a) - yearOf(b));
    if (selectedChildId) return sorted.filter((c) => c.id === selectedChildId);
    return sorted;
  }, [selectableChildren, selectedChildId]);

  // childId → 등록완료(active) classId 집합
  const [enrolledByChild, setEnrolledByChild] = useState<Map<string, Set<string>>>(new Map());
  // childId → 등록완료 수업 카드 데이터
  const [classesByChild, setClassesByChild] = useState<Map<string, EnrolledClassItem[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // 1) 전체 enrollment → 자녀별 등록완료 classId 집합
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<EnrollmentRow[] | { data?: EnrollmentRow[] }>(
          '/enrollments',
          { retry: false },
        );
        if (cancelled) return;
        const arr = Array.isArray(res.data)
          ? res.data
          : (res.data as { data?: EnrollmentRow[] })?.data ?? [];
        const map = new Map<string, Set<string>>();
        (Array.isArray(arr) ? arr : []).forEach((e) => {
          // 등록완료 = 활성 등록(선불 paid / 후불 approved) — 수업목록과 동일 SoT.
          if (!isActiveEnrollment(e.status, e.class?.billingMode)) return;
          const cid = e.childId ?? e.child?.id;
          const clsId = e.classId ?? e.class?.id;
          if (!cid || !clsId) return;
          if (!map.has(cid)) map.set(cid, new Set());
          map.get(cid)!.add(clsId);
        });
        setEnrolledByChild(map);
      } catch {
        if (!cancelled) setEnrolledByChild(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 등록완료 수업이 있는 자녀별로 수업 풀데이터 fetch → 등록완료만 추림
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const targets = children.filter((c) => (enrolledByChild.get(c.id)?.size ?? 0) > 0);
      const entries = await Promise.all(
        targets.map(async (c) => {
          const enrolledSet = enrolledByChild.get(c.id)!;
          try {
            const res = await api.get<EnrolledClassItem[] | { data?: EnrolledClassItem[] }>(
              `/classes?childId=${c.id}`,
              { retry: false },
            );
            const list = res.success ? normalizeClassList(res.data) : [];
            return [c.id, list.filter((cls) => enrolledSet.has(cls.id))] as const;
          } catch {
            return [c.id, [] as EnrolledClassItem[]] as const;
          }
        }),
      );
      if (cancelled) return;
      setClassesByChild(new Map(entries));
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [children, enrolledByChild]);

  // 등록완료 수업이 하나라도 있는 자녀만 노출.
  const childrenWithEnrolled = useMemo(
    () => children.filter((c) => (classesByChild.get(c.id)?.length ?? 0) > 0),
    [children, classesByChild],
  );

  if (isLoading) return null;
  if (childrenWithEnrolled.length === 0) return null;

  return (
    <section className="px-4 sm:px-5 pt-4" aria-label="등록훈련">
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <Icon name="task_alt" className="text-card-title text-emerald-500" aria-hidden="true" />
        <h2 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]">
          등록훈련
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        {childrenWithEnrolled.map((child) => {
          const classes = classesByChild.get(child.id) ?? [];
          return (
            <div key={child.id}>
              <p className="px-1 pb-1.5 text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                {child.name}
                <span className="ml-1 text-wtext-3 dark:text-rink-300 tabular-nums">
                  ({classes.length})
                </span>
              </p>
              <div className={cn('flex flex-col gap-2')}>
                {classes.map((cls) => (
                  <EnrolledClassCard key={cls.id} item={cls} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default EnrolledTrainingSection;
