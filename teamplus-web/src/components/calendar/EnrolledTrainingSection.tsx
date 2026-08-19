'use client';

/**
 * EnrolledTrainingSection — 학부모 통합 캘린더 상단 '등록훈련' 섹션 (2026-06-18 신규).
 *
 * 각 자녀마다 '등록완료(결제/수강 중)'된 수업만 노출한다.
 * 행 형태는 수업목록 페이지(classes/page.tsx DefaultClassCard)와 동일하게 ClassListCard
 * iceTheme + compact 리스트 행 + '등록완료' 칩(titleRight)으로 통일한다.
 * (해당 페이지의 소형 일정 포맷 헬퍼를 동일 컨벤션으로 재현)
 */

import { useEffect, useMemo, useState } from 'react';
import { ClassListCard, ClassCardInfoRow } from '@/components/classes/ClassListCard';
import {
  TRAINING_TYPE_LABEL,
  formatDaySchedulesShort,
  formatNextScheduleSummary,
  formatPeriodSummary,
  type DaySchedule,
  type NextScheduleInfo,
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
  nextSchedule?: NextScheduleInfo | null;
  /** 비취소 총 회차 수 — "총 N회" 표기용. */
  scheduleCount?: number;
  /** 대상 출생연도 — "대상: 2014, 2015년생" 표기용. */
  targetBirthYears?: number[] | null;
}

interface EnrollmentRow {
  childId?: string;
  classId?: string;
  status?: string;
  hasValidPass?: boolean | null;
  child?: { id?: string } | null;
  class?: { id?: string; billingMode?: string } | null;
  product?: { billingTiming?: string } | null;
}

// ── 일정 라벨 포맷 — classes/page.tsx 와 동일 컨벤션 (소형 재현) ──
// 시간 표시 SoT: 요일별 기본 일정 패턴 > 첫/다음 회차 실제 시각 > 미표시.
// 대표값(Class.startTime)은 회차별 실제 시각과 다를 수 있어 표시에 사용하지 않는다.

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

/** 대상 출생연도 — "2014, 2015년생" 형태. 중복 제거 + 오름차순 (classes/page.tsx 동일 컨벤션). */
function formatBirthYears(years?: number[] | null): string | null {
  if (!Array.isArray(years) || years.length === 0) return null;
  const sorted = Array.from(new Set(years.filter((y) => Number.isFinite(y)))).sort(
    (a, b) => a - b,
  );
  if (sorted.length === 0) return null;
  return `${sorted.join(', ')}년생`;
}

function scheduleLineOf(item: EnrolledClassItem): string | null {
  const dayScheduleLabel = formatDaySchedulesShort(item.daySchedules);
  const time = dayScheduleLabel
    ? null
    : item.trainingType === 'lesson'
      ? item.scheduleTimeLabel ?? null
      : (formatNextScheduleSummary(
          item.nextSchedule,
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ) ??
        formatPeriodSummary(
          item.scheduledDates?.[0],
          item.scheduledDates?.[item.scheduledDates.length - 1],
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ));
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);
  if (!daysLabel && !time) return null;
  return `${daysLabel || time}${daysLabel && time ? ` · ${time}` : ''}`;
}

// ── 등록완료 수업 행 — 수업목록 DefaultClassCard 와 동일 ClassListCard compact 형태 ──
function EnrolledClassCard({ item, iceTheme }: { item: EnrolledClassItem; iceTheme?: boolean }) {
  const scheduleLine = scheduleLineOf(item);
  // 일정 + 대상 한 줄 — /classes 리스트 행과 동일 표기 (대상 미입력 = '전체').
  const targetLine = `대상: ${formatBirthYears(item.targetBirthYears) ?? '전체'}`;
  const metaLine = scheduleLine ? `${scheduleLine} · ${targetLine}` : targetLine;
  const typeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  return (
    <ClassListCard
      href={`/classes/${item.id}`}
      iceTheme={iceTheme}
      compact
      trainingType={item.trainingType}
      typeBadgeLabel={typeLabel}
      ariaLabel={`${item.className} 수업 상세 보기`}
      title={item.className}
      titleRight={
        /* 등록 상태 칩 — /classes compact 행과 동일 규격 (시각 표시 전용). */
        <span
          className="inline-flex items-center justify-center min-w-[62px] px-2 py-0.5 rounded-full text-[11.5px] leading-[1.55] font-bold tracking-[-0.01em] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
          aria-hidden="true"
        >
          등록완료
        </span>
      }
    >
      <ClassCardInfoRow icon={scheduleLine ? 'schedule' : 'cake'}>{metaLine}</ClassCardInfoRow>
    </ClassListCard>
  );
}

function normalizeClassList(
  data: EnrolledClassItem[] | { data?: EnrolledClassItem[] } | undefined,
): EnrolledClassItem[] {
  const list = Array.isArray(data) ? data : data?.data;
  return Array.isArray(list) ? list : [];
}

interface EnrolledTrainingSectionProps {
  /**
   * ICETIMES flat variant. 기본 false = 기존 동작.
   * true 일 때 섹션 헤더/자녀 라벨 텍스트를 it-ink 톤으로 평탄화한다.
   * 카드 표면은 ClassListCard(외부 컴포넌트)가 소유하므로 변경 대상 아님.
   */
  iceTheme?: boolean;
}

export function EnrolledTrainingSection({ iceTheme = false }: EnrolledTrainingSectionProps = {}) {
  const { selectableChildren } = useChildren();
  // [2026-06-19 사용자 직접 지시] 등록훈련은 현재 선택된 자녀(홈/전체메뉴 선택) 기준으로만 노출.
  const { selectedChildId } = useSelectedChild();

  // 현재 선택된 자녀만 노출 (선택값 없으면 안전망으로 전체 — 보통 컨텍스트가 첫 자녀 자동 선택).
  //   순서는 useChildren.selectableChildren 단일 SoT를 그대로 사용(지역 재정렬 제거).
  const children = useMemo(() => {
    if (selectedChildId)
      return selectableChildren.filter((c) => c.id === selectedChildId);
    return selectableChildren;
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
          // 등록완료 = 활성 등록(선불 paid / 후불·BOTH 후불상품 approved) — 수업목록과 동일 SoT.
          if (
            !isActiveEnrollment(
              e.status,
              e.class?.billingMode,
              e.product?.billingTiming,
              e.hasValidPass,
            )
          )
            return;
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
    <section
      className={cn(
        // compact 행이 자체 px-4 를 가지므로 섹션 수평 패딩은 헤더/라벨에만 준다
        //   (행 hairline 을 /classes 처럼 full-bleed 로 유지).
        'pt-4',
        // ICETIMES: 회색 캔버스 위에 떠 보이지 않도록 흰 섹션으로 self-wrap(mt-2 = 상단 8px 회색 갭).
        //   pb-4 로 행 묶음 하단 여백 확보. 기본 테마는 기존 padding 그대로(회귀 0).
        iceTheme && 'mt-2 bg-it-surface pb-4 dark:bg-rink-800',
      )}
      aria-label="등록훈련"
    >
      <div className="flex items-center gap-1.5 px-5 sm:px-6 pb-2">
        <Icon name="task_alt" className="text-card-title text-emerald-500" aria-hidden="true" />
        <h2
          className={cn(
            'text-card-body font-extrabold tracking-[-0.02em]',
            iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
          )}
        >
          등록훈련
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        {childrenWithEnrolled.map((child) => {
          const classes = classesByChild.get(child.id) ?? [];
          return (
            <div key={child.id}>
              <p
                className={cn(
                  'px-5 sm:px-6 pb-1.5 text-card-meta font-bold',
                  iceTheme ? 'text-it-ink-700 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100',
                )}
              >
                {child.name}
                <span
                  className={cn(
                    'ml-1 tabular-nums',
                    iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
                  )}
                >
                  ({classes.length})
                </span>
              </p>
              {/* iceTheme compact 행은 border-b hairline 으로 구분 → gap 없이 연속 리스트.
                  기본 테마(미사용 경로)는 카드 외형이라 gap 유지. */}
              <div className={cn('flex flex-col', !iceTheme && 'gap-2 px-4 sm:px-5')}>
                {classes.map((cls) => (
                  <EnrolledClassCard key={cls.id} item={cls} iceTheme={iceTheme} />
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
