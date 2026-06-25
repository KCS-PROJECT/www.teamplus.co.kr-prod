'use client';

/**
 * Director — 코치에게 수업 배정 페이지 (신규)
 *
 * [추가 W2.D 2026-05-18] director-coaches 목록 페이지의 "수업 배정" 버튼이
 *   /classes-manage/create?coachId=... 로 이동하던 회귀 (#2 이슈) 를 해결.
 *   본 페이지는 "해당 코치에게 기존 수업을 배정" 흐름을 제공한다.
 *
 * 흐름:
 *  1. 본인 관리 팀 (`/teams/my/managed`) 의 모든 수업 (`/teams/:teamId/classes`) 로드
 *  2. coachId 가 비어있거나 본 코치와 다른 수업만 후보로 노출 (미배정 / 다른 코치 배정)
 *  3. 사용자가 1+ 개 수업 선택 → "배정하기" 버튼
 *  4. `PUT /api/v1/teams/:teamId/classes/:classId` 로 coachId 변경 (병렬 호출)
 *  5. 성공 시 toast + emitRefresh(CLASSES, COACHES) + 코치 상세로 navigate
 *
 * 규칙:
 *  - MobileContainer + usePageReady + useNativeUI 필수
 *  - AppBar/BottomNav 불가침
 *  - bg-gradient/backdrop-blur 0건
 *  - 한글 버튼 라벨
 *  - dark: 변형 전수 적용
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { resolveImageSrc } from '@/lib/image-url';
import { MESSAGES } from '@/lib/messages';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import { cn } from '@/lib/utils';

interface CoachInfo {
  id: string;
  name: string;
  specialty: string;
  avatarUrl?: string | null;
}

interface AvailableClass {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  schedule: string;
  currentCoachId: string | null;
  currentCoachName: string | null;
  isUnassigned: boolean;
}

export default function DirectorCoachAssignClassPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  const params = useParams();
  const coachId = params?.id as string;
  const { navigate, back } = useNavigation();
  const { toast } = useToast();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // PageAppBar(forceNative) 사용
    showBottomNav: true,
    showBackButton: true,
    appBarTitle: '수업 배정',
  });

  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [classes, setClasses] = useState<AvailableClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 풀스크린 로더 fast-path — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // ─── 데이터 로드 ───────────────────────────────────────
  const load = useCallback(async () => {
    if (!coachId) return;
    setIsLoading(true);
    try {
      // 1) 코치 기본 정보
      const coachRes = await api.get<Record<string, unknown>>(
        `/admin/coaches/${coachId}`,
      );
      if (coachRes.success && coachRes.data) {
        const d = coachRes.data;
        const user = (d.user ?? d) as Record<string, unknown>;
        setCoach({
          id: (d.id ?? user.id ?? coachId) as string,
          // [2026-05-18 BUG FIX] ?? / || 혼용 TS5076 → 괄호 명시로 우선순위 고정.
          name:
            ((user.name as string) ??
              `${(user.lastName as string) ?? ''}${(user.firstName as string) ?? ''}`.trim()) ||
            '코치',
          specialty: (d.specialty as string) ?? '아이스하키',
          avatarUrl: (d.avatarUrl as string) ?? (user.avatarUrl as string) ?? null,
        });
      }

      // 2) 본인 관리 팀 목록
      const teamsRes = await api.get<Array<{ id: string; name: string }>>(
        '/teams/my/managed',
      );
      if (
        !teamsRes.success ||
        !Array.isArray(teamsRes.data) ||
        teamsRes.data.length === 0
      ) {
        setClasses([]);
        return;
      }

      // 3) 각 팀의 수업 목록 병렬 로드
      // [수정 2026-05-26 B8] 실제 백엔드 응답(getClubClasses) 필드 반영.
      //   응답은 수업명을 `className` 으로, 코치명을 `coach`(문자열)로 내려준다.
      //   기존 타입엔 className 이 없어 name/title 폴백이 항상 실패 → '수업' 표시.
      type ClassRow = {
        id?: string;
        className?: string;
        name?: string;
        title?: string;
        coachId?: string | null;
        // getClubClasses 는 coach 를 코치명 문자열로 반환. 일부 응답은 객체일 수 있어 union.
        coach?: { id?: string; name?: string } | string | null;
        coachName?: string;
        schedule?: string;
        scheduleLabel?: string;
        dayOfWeek?: string;
        time?: string;
        startTime?: string;
      };

      const teamResults = await Promise.all(
        teamsRes.data.map(async (t) => {
          const cr = await api.get<
            ClassRow[] | { data?: ClassRow[]; classes?: ClassRow[] }
          >(`/teams/${t.id}/classes`).catch(() => null);
          if (!cr?.success || !cr.data) return [] as AvailableClass[];
          const list: ClassRow[] = Array.isArray(cr.data)
            ? cr.data
            : Array.isArray((cr.data as { classes?: ClassRow[] }).classes)
              ? (cr.data as { classes: ClassRow[] }).classes
              : Array.isArray((cr.data as { data?: ClassRow[] }).data)
                ? (cr.data as { data: ClassRow[] }).data ?? []
                : [];
          return list.map<AvailableClass>((c) => {
            const coachObj =
              typeof c.coach === 'object' && c.coach !== null ? c.coach : null;
            const currentCoachId = c.coachId ?? coachObj?.id ?? null;
            const isUnassigned = !currentCoachId;
            // 코치명: 백엔드는 coach 를 문자열로 반환. 객체 응답도 방어적 처리.
            const currentCoachName =
              typeof c.coach === 'string'
                ? c.coach
                : (coachObj?.name ?? c.coachName ?? null);
            const scheduleLabel =
              c.scheduleLabel ??
              c.schedule ??
              ([c.dayOfWeek, c.time].filter(Boolean).join(' ').trim() ||
                (c.dayOfWeek && c.startTime
                  ? `${c.dayOfWeek} ${c.startTime}`
                  : ''));
            return {
              id: (c.id as string) ?? '',
              // [수정 2026-05-26 B8] className 우선 — 실제 수업명 표시 ('수업' 폴백 제거 효과).
              name: (c.className ?? c.name ?? c.title ?? '수업') as string,
              teamId: t.id,
              teamName: t.name,
              schedule: scheduleLabel,
              currentCoachId,
              currentCoachName,
              isUnassigned,
            };
          });
        }),
      );

      // 4) flatten + 현재 코치에게 이미 배정된 수업 제외 (재할당 후보가 아님)
      const flattened = teamResults
        .flat()
        .filter((c) => c.id && c.currentCoachId !== coachId);
      setClasses(flattened);
    } catch {
      setClasses([]);
    } finally {
      setIsLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── 선택 토글 ────────────────────────────────────────
  const toggleSelect = useCallback((classId: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  }, []);

  const selectedCount = selectedClassIds.size;

  // ─── 미배정 / 다른 코치 배정 분류 ─────────────────────
  const { unassignedList, reassignList } = useMemo(() => {
    const unassigned: AvailableClass[] = [];
    const reassign: AvailableClass[] = [];
    for (const c of classes) {
      if (c.isUnassigned) {
        unassigned.push(c);
      } else {
        reassign.push(c);
      }
    }
    return { unassignedList: unassigned, reassignList: reassign };
  }, [classes]);

  // ─── 배정 제출 ────────────────────────────────────────
  const handleAssign = useCallback(async () => {
    if (selectedCount === 0 || isSubmitting || !coachId) return;
    setIsSubmitting(true);
    try {
      const selected = classes.filter((c) => selectedClassIds.has(c.id));
      const results = await Promise.allSettled(
        selected.map((c) =>
          api.put(`/teams/${c.teamId}/classes/${c.id}`, { coachId }),
        ),
      );
      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
      const failedCount = selected.length - successCount;

      if (successCount > 0) {
        toast.success(
          failedCount === 0
            ? `${successCount}개 수업이 배정되었습니다.`
            : `${successCount}개 수업 배정 완료 (${failedCount}개 실패)`,
        );
        // 관련 listing/대시보드 갱신 신호
        emitRefresh(REFRESH_KEYS.CLASSES);
        emitRefresh(REFRESH_KEYS.COACHES);
        navigate(`/director-coaches/${coachId}`);
      } else {
        toast.error(MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSubmitting(false);
    }
  }, [classes, coachId, navigate, selectedClassIds, selectedCount, isSubmitting, toast]);

  if (isLoading) return null;

  const initial = coach?.name?.charAt(0) || '?';
  const hasAnyClass = classes.length > 0;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="수업 배정" onBack={back} forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-[calc(96px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+72px)]"
        role="main"
        aria-label="코치 수업 배정"
      >
        {/* 코치 정보 — navy 히어로 밴드 (배정 대상 강조) */}
        {coach && (
          <section className="bg-it-blue-800 dark:bg-it-blue-950 px-6 pt-5 pb-5" aria-label="배정 대상 코치">
            <div className="flex items-center gap-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-w-md bg-it-blue-700/60 dark:bg-rink-700 flex items-center justify-center">
                {resolveImageSrc(coach.avatarUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(coach.avatarUrl)}
                    alt={`${coach.name} 코치`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-card-section font-bold text-white/80">
                    {initial}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-card-meta font-medium text-white/65">
                  배정 대상 코치
                </p>
                <h2 className="text-card-title font-bold text-white truncate mt-0.5">
                  {coach.name}
                </h2>
                <p className="text-card-body text-white/75 truncate mt-0.5">
                  {coach.specialty}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 선택 카운트 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4" aria-label="선택 수업 카운트">
          <div className="flex items-center justify-between">
            <h3 className="text-[17px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em]">
              배정할 수업
            </h3>
            <span className="text-card-body font-bold font-num tabular-nums text-it-blue-500">
              {selectedCount}
              <span className="text-it-ink-500 dark:text-wtext-4 font-medium">
                {' / '}
                {classes.length}
              </span>
            </span>
          </div>
        </section>

        {/* 빈 상태 — flat 흰 섹션 (점선 박스 제거) */}
        {!hasAnyClass && (
          <section className="bg-it-surface dark:bg-rink-800 px-6 pb-16">
            <div
              role="status"
              className="flex flex-col items-center justify-center gap-2 pt-8 text-center"
            >
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-line dark:bg-rink-700">
                <Icon
                  name="sports_hockey"
                  className="text-[36px] text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body font-bold text-it-ink-800 dark:text-white">
                배정 가능한 수업이 없습니다
              </p>
              <p className="max-w-xs text-card-meta leading-relaxed text-it-ink-500 dark:text-wtext-4">
                새 수업을 먼저 등록하거나 이미 모든 수업이 이 코치에게
                배정되어 있을 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => navigate('/classes-manage/create')}
                className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-w-md bg-it-blue-500 px-4 py-2 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
              >
                <Icon name="add" className="text-[18px]" aria-hidden="true" />
                새 수업 등록하기
              </button>
            </div>
          </section>
        )}

        {/* 미배정 수업 섹션 — flat 흰 섹션 */}
        {unassignedList.length > 0 && (
          <section
            className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5"
            aria-label="코치가 배정되지 않은 수업"
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-flex h-2 w-2 rounded-w-pill bg-it-red-500"
                aria-hidden="true"
              />
              <h3 className="text-card-meta font-bold uppercase tracking-[0.12em] text-it-ink-500 dark:text-wtext-4">
                미배정 ({unassignedList.length})
              </h3>
            </div>
            <ul className="flex flex-col gap-2">
              {unassignedList.map((c) => (
                <ClassRowCard
                  key={c.id}
                  cls={c}
                  selected={selectedClassIds.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* flat 섹션 사이 8px 회색 갭 */}
        {unassignedList.length > 0 && reassignList.length > 0 && (
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        )}

        {/* 다른 코치 배정 수업 섹션 (재할당 후보) — flat 흰 섹션 */}
        {reassignList.length > 0 && (
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5" aria-label="다른 코치가 배정된 수업">
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-flex h-2 w-2 rounded-w-pill bg-it-ink-400"
                aria-hidden="true"
              />
              <h3 className="text-card-meta font-bold uppercase tracking-[0.12em] text-it-ink-500 dark:text-wtext-4">
                다른 코치 배정 ({reassignList.length})
              </h3>
            </div>
            <p className="mb-3 text-card-meta text-it-ink-500 dark:text-wtext-4">
              선택 시 코치가 변경됩니다.
            </p>
            <ul className="flex flex-col gap-2">
              {reassignList.map((c) => (
                <ClassRowCard
                  key={c.id}
                  cls={c}
                  selected={selectedClassIds.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                />
              ))}
            </ul>
          </section>
        )}

        <div className="h-6" aria-hidden="true" />
      </main>

      {/* 하단 액션 — Sticky bottom CTA (max-w-md 중앙 정렬, BottomNav 위) */}
      <div
        className="fixed inset-x-0 z-40 pointer-events-none flex justify-center"
        style={{
          bottom:
            'calc(68px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div className="pointer-events-auto w-full max-w-md px-5 pb-3">
          <button
            type="button"
            onClick={handleAssign}
            disabled={selectedCount === 0 || isSubmitting}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-w-pill text-card-emphasis font-extrabold transition-colors motion-reduce:transition-none active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2',
              selectedCount === 0 || isSubmitting
                ? 'bg-it-line dark:bg-rink-700 text-it-ink-400 dark:text-wtext-4 cursor-not-allowed'
                : 'bg-it-blue-500 text-white shadow-sh-blue hover:bg-it-blue-600',
            )}
            aria-label={`선택한 ${selectedCount}개 수업 배정하기`}
          >
            {isSubmitting ? (
              <>
                <Icon
                  name="progress_activity"
                  className="text-[20px] animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>배정 중...</span>
              </>
            ) : (
              <>
                <Icon
                  name="add_task"
                  className="text-[20px]"
                  aria-hidden="true"
                />
                <span>
                  {selectedCount > 0
                    ? `${selectedCount}개 수업 배정하기`
                    : '수업을 선택해주세요'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}

// ─── 내부 컴포넌트 ──────────────────────────────────────
interface ClassRowCardProps {
  cls: AvailableClass;
  selected: boolean;
  onToggle: () => void;
}

function ClassRowCard({ cls, selected, onToggle }: ClassRowCardProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={cn(
          'flex w-full items-center gap-3 rounded-w-md border-[1.5px] p-3.5 text-left transition-colors duration-200 ease-wallet motion-reduce:transition-none active:brightness-95',
          selected
            ? 'border-it-blue-500 bg-it-blue-50 dark:border-it-blue-500 dark:bg-it-blue-500/10'
            : 'border-it-line-strong bg-it-surface hover:border-it-ink-300 dark:border-rink-700 dark:bg-rink-800 dark:hover:border-rink-500',
        )}
      >
        {/* Checkbox 표시 */}
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-w-xs border-2 transition-colors',
            selected
              ? 'bg-it-blue-500 border-it-blue-500 text-white'
              : 'bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-700',
          )}
          aria-hidden="true"
        >
          {selected && <Icon name="check" className="text-[16px]" />}
        </span>

        {/* 수업 아이콘 — 정규 SoT 초록(emerald) */}
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-w-md bg-emerald-50 dark:bg-emerald-900/20"
          aria-hidden="true"
        >
          <Icon name="sports_hockey" className="text-[20px] text-emerald-500" />
        </span>

        {/* 정보 */}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="block text-card-body font-bold text-it-ink-800 dark:text-white truncate">
              {cls.name}
            </span>
            {cls.isUnassigned && (
              <span className="inline-flex shrink-0 items-center rounded-w-xs bg-it-red-50 dark:bg-it-red-500/20 px-1.5 py-0.5 text-card-meta font-bold text-it-red-500">
                미배정
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-card-meta text-it-ink-500 dark:text-wtext-4">
            <span className="truncate">{cls.teamName}</span>
            {cls.schedule && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{cls.schedule}</span>
              </>
            )}
          </span>
          {cls.currentCoachName && !cls.isUnassigned && (
            <span className="mt-0.5 block text-card-meta text-it-ink-500 dark:text-wtext-4">
              현재 코치:{' '}
              <span className="font-bold text-it-ink-600 dark:text-wtext-4">
                {cls.currentCoachName}
              </span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
