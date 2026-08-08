'use client';

/**
 * TeamClassesSummary — 학부모 대시보드 수업 목록 요약 카드
 *  - GET /classes + GET /tournaments 병렬 호출 → 수업+진행중 대회를 임박순으로 섞어 상위 N건(기본 5).
 *    백엔드가 각각 학부모 가시성 기준 필터링(대회는 자녀 소속 팀 + 출생연도 자격).
 *  - SectionHead "수업 목록" + "전체보기 ›" → /classes (카탈로그/등록 진입점은 그대로 유지)
 *  - 카드: 타입 배지(라벨) + 수업명/대회명 + 코치·요일(수업) | 기간(대회) → 클릭 시 /classes/[id] | /tournaments/[id]
 *  - 빈 상태: emptyByPersona.parent('수업')
 *  - onReady: 첫 fetch 완료(에러/빈 응답 포함) 시 1회 true 발화 → 부모 usePageReady 합성
 *  - DESIGN.md Pattern B 카드 (wsurface · sh-1 · ice-500), 솔리드 컬러, dark: 변형 필수.
 */

import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { SectionHead } from '@/components/wallet';
import { api } from '@/services/api-client';
import {
  listTournaments,
  type TournamentListItem,
} from '@/services/tournament.service';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import {
  isActiveEnrollment,
  isMyEnrollment,
} from '@/lib/enrollment-visibility';
import {
  getTrainingTypeBadgeClass,
  TRAINING_TYPE_LABEL,
} from '@/lib/class-categories';

interface ClassSummaryItem {
  id: string;
  className: string;
  instructorName?: string | null;
  trainingType?: string | null;
  startTime?: string;
  endTime?: string;
  classDays?: string[];
  /**
   * 수명주기 상태(class-lifecycle SoT) — 'ENDED'(명시 종료·spot 자동종료) 수업은 요약에서 제외.
   * 필드 부재 시 제외하지 않음(구 엔드포인트 호환). 'PENDING_SCHEDULE'(일정 대기)은 종료 아님.
   */
  lifecycleStatus?: string | null;
}

/**
 * 수업·대회를 한 리스트로 섞기 위한 통합 항목.
 *  - sortKey: 임박순 정렬용 시작일시(ms). 파싱 실패 시 Infinity → 맨 뒤로.
 */
type SummaryItem =
  | {
      kind: 'class';
      id: string;
      title: string;
      trainingType?: string | null;
      instructorName?: string | null;
      classDays?: string[];
      /** [2026-06-15] 등록완료(결제) 수업 — 정렬 시 위로. */
      enrolled?: boolean;
      /** [2026-08-04] 신청·요청 대기(결제 전) — myOnly 목록에서 '신청중' 칩으로 구분. */
      pending?: boolean;
      sortKey: number;
    }
  | {
      kind: 'tournament';
      id: string;
      title: string;
      /** null = 일정 미정 대회 — sortKey Infinity(맨 뒤)·노출 필터 통과(항상 노출). */
      startDate: string | null;
      endDate: string | null;
      /** [2026-06-16] 자녀 1명이라도 결제완료(PAID) — 정렬 시 위로. */
      enrolled?: boolean;
      sortKey: number;
    };

/** /enrollments 행 — 등록완료(선불 paid/후불·BOTH 후불상품 approved) 판정용 최소 필드. */
interface EnrollRow {
  hasValidPass?: boolean | null;
  classId?: string;
  childId?: string;
  status?: string;
  child?: { id?: string } | null;
  class?: { id?: string; billingMode?: string } | null;
  product?: { billingTiming?: string } | null;
}

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiDataWrapper<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

/** listTournaments 응답(배열 또는 { data: [] } 래핑)을 안전하게 언래핑. (classes 페이지 정책 정합) */
function unwrapTournamentList(payload: unknown): TournamentListItem[] {
  const inner = unwrap<TournamentListItem[] | { data?: TournamentListItem[] }>(
    payload,
  );
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray((inner as { data?: TournamentListItem[] }).data)) {
    return (inner as { data?: TournamentListItem[] }).data ?? [];
  }
  return [];
}

/** ISO 문자열 → ms. 파싱 실패 시 Infinity(맨 뒤). */
function toSortMs(iso?: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * @db.Date(UTC 자정) 저장 날짜 → 'YYYY-MM-DD' 달력일 키.
 *  대회 startDate 는 @db.Date 라 getUTC* 로 추출해야 KST 달력일과 일치.
 */
function toDbDateKey(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 현재 KST 달력일 'YYYY-MM-DD' (now + 9h 의 UTC 달력일). */
function todayKstDateKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// [2026-06-16] 수업명 밑 정보(일정/담당자) 제거로 formatClassDays·formatTournamentDateRange 미사용 → 삭제.

interface Props {
  /** 첫 fetch 완료 시 true 발화(에러/빈 응답 포함) → 부모 usePageReady 합성용 */
  onReady?: (ready: boolean) => void;
  /** 표시할 최대 항목 수 (기본 5) — classLimit/tournamentLimit 미지정 시 유형별 폴백값. */
  limit?: number;
  /** 훈련(수업) 최대 노출 수 — 미지정 시 limit. */
  classLimit?: number;
  /** 대회 최대 노출 수 — 미지정 시 limit. */
  tournamentLimit?: number;
  /**
   * 선택 자녀 ID — 학부모만 주입(자녀별 수업·대회·등록 필터).
   * 감독/코치/오픈클래스감독은 미주입(undefined) → viewer(소속 팀) 기준 전체.
   */
  selectedChildId?: string | null;
  /**
   * 등록완료(결제) 배지 표시 — 학부모 true(기본). 운영자(감독/코치)는 false
   *  → /enrollments 호출도 생략.
   */
  showEnrollment?: boolean;
  /** "전체보기" 이동 경로 — 학부모 '/classes'(기본), 감독/코치 '/classes-manage'. */
  targetPath?: string;
  /** 수업 목록 조회 경로 — 기본 '/classes'(viewer 소속 팀). 오픈클래스는 '/academies/:id/classes'. */
  classesEndpoint?: string;
  /**
   * 수업 카테고리 — 'regular'(정규수업만, 오픈클래스 제외) | 'open'(오픈클래스만).
   * 미지정 시 백엔드 '전체 탭' = 본인 팀 정규수업 + 노출 허용 오픈클래스 모두.
   * 감독/코치 대시보드는 'regular' 주입 → '/classes-manage'(정규+대회) 와 동일 기준.
   */
  classesCategory?: 'regular' | 'open';
  /** 대회 포함 여부 — 기본 true. 오픈클래스(academy)는 false(대회 개념 없음). */
  showTournament?: boolean;
  /**
   * [ICETIMES Phase 2b] ICETIMES flat 테마. 기본 false = 기존 스타일 그대로.
   *   true 시 카드 shadow 제거 + flat it-surface/it-line, 행 hover/구분선 it 톤 적용.
   */
  iceTheme?: boolean;
  /**
   * [2026-08-04 사용자 지시] '내 것만' 모드 — 등록했거나 신청/요청한 수업·대회만 노출.
   *
   * 기본 false 는 기존 동작(소속 팀 카탈로그 전체)이라 감독/코치 대시보드는 영향 0.
   * 학부모 홈에서 true 로 켜면 메인 화면이 "내 수업 현황"이 되고, 새 수업 발견은
   * '전체보기'(→ /classes 카탈로그)와 빈 상태 CTA 가 담당한다.
   *
   * ⚠️ showEnrollment=false 면 등록 정보를 아예 조회하지 않으므로 이 옵션은 무시된다.
   */
  myOnly?: boolean;
}

export function TeamClassesSummary({
  onReady,
  limit = 5,
  classLimit,
  tournamentLimit,
  selectedChildId = null,
  showEnrollment = true,
  targetPath = '/classes',
  classesEndpoint = '/classes',
  classesCategory,
  showTournament = true,
  iceTheme = false,
  myOnly = false,
}: Props) {
  const { navigate } = useNavigation();
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // onReady 는 부모가 매 렌더 새 함수로 전달할 수 있어 ref mirror — 발화는 로딩 전환 시 1회.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  const readyFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 수업·대회·등록(결제) 병렬 호출 — 한쪽 실패해도 다른 쪽은 표시(부분 성공 허용).
      const [classRes, tournamentRes, enrollRes] = await Promise.all([
        api.get<ClassSummaryItem[] | { data?: ClassSummaryItem[] }>(classesEndpoint, {
          // childId 전송 시 해당 자녀 소속 팀 수업, 미전송 시 viewer(소속 팀) 기준 전체.
          // category='regular' 시 오픈클래스 제외(감독/코치 대시보드 — 본인 팀 정규수업만).
          params: {
            ...(selectedChildId ? { childId: selectedChildId } : {}),
            ...(classesCategory ? { category: classesCategory } : {}),
          },
          retry: false,
        }),
        // 대회 포함(showTournament)일 때만 조회 — 오픈클래스는 대회 개념이 없어 생략.
        showTournament
          ? listTournaments(selectedChildId ? { childId: selectedChildId } : undefined)
          : Promise.resolve(null),
        // 등록완료 배지(학부모)일 때만 등록 조회 — 운영자는 생략(빈 결과 취급).
        // [2026-06-19] 후불(POSTPAID) 수업은 등록완료가 'approved'(신청만)이므로 status=paid 만으로는 누락.
        //   전체 enrollment 를 받아 isActiveEnrollment(선불 paid / 후불 approved)로 판정한다.
        showEnrollment
          ? api.get<
              | EnrollRow[]
              | { data?: EnrollRow[] }
            >('/enrollments', { retry: false })
          : Promise.resolve(null),
      ]);
      if (cancelled) return;

      // [2026-06-15] 등록완료(결제) classId 집합 — 정렬 시 상단 우선.
      const enrolledIds = new Set<string>();
      // [2026-08-04] 신청·요청 대기(결제 전) classId 집합 — myOnly 목록 포함 + '신청중' 칩.
      const pendingIds = new Set<string>();
      if (enrollRes && enrollRes.success && enrollRes.data) {
        const arr = Array.isArray(enrollRes.data)
          ? enrollRes.data
          : (enrollRes.data as { data?: unknown[] }).data;
        (Array.isArray(arr) ? arr : []).forEach((e) => {
          const row = e as EnrollRow;
          // 취소·거절 등 종결 상태는 '내 것'이 아니다 — 여기서 먼저 걸러낸다.
          if (!isMyEnrollment(row.status)) return;
          // [2026-06-17] 선택 자녀 기준 필터 — /enrollments 는 부모의 모든 자녀 등록을
          //   반환하므로, 형제 등록이 선택 자녀 카드에 '등록완료'로 잘못 표시되던 버그 수정.
          const cid = row.childId ?? row.child?.id;
          if (selectedChildId && cid && cid !== selectedChildId) return;
          const id = row.classId ?? row.class?.id;
          if (!id) return;
          // 등록완료 판정 — 선불 paid / 후불(POSTPAID·BOTH 후불상품) approved (isActiveEnrollment SoT).
          //   그 외(pending·pending_approval·선불 approved)는 '신청중'.
          if (
            isActiveEnrollment(
              row.status,
              row.class?.billingMode,
              row.product?.billingTiming,
              row.hasValidPass,
            )
          ) {
            enrolledIds.add(id);
            pendingIds.delete(id);
          } else if (!enrolledIds.has(id)) {
            pendingIds.add(id);
          }
        });
      }

      const classPayload = classRes.success
        ? unwrap<ClassSummaryItem[]>(classRes.data)
        : null;
      const classItems: SummaryItem[] = (
        Array.isArray(classPayload) ? classPayload : []
      )
        // 종료(ENDED) 수업 제외 — 명시 종료·spot 자동종료. 대기(PENDING_SCHEDULE)는 유지.
        .filter((c) => c.lifecycleStatus !== 'ENDED')
        // [2026-08-04] myOnly — 등록했거나 신청/요청한 수업만. 카탈로그(미신청)는 제외.
        .filter(
          (c) => !myOnly || enrolledIds.has(c.id) || pendingIds.has(c.id),
        )
        .map((c) => ({
        kind: 'class',
        id: c.id,
        title: c.className,
        trainingType: c.trainingType,
        instructorName: c.instructorName,
        classDays: c.classDays,
        enrolled: enrolledIds.has(c.id),
        pending: pendingIds.has(c.id),
        sortKey: toSortMs(c.startTime),
      }));

      // 대회는 진행 예정/진행 중(scheduled·ongoing)만 — 취소·종료 대회는 요약에서 제외.
      //  + 첫 일정(startDate)이 오늘 이상인 대회만 노출 — 첫 일정 당일까지는 노출하고
      //    다음날부터 대시보드 요약에서 제외한다. startDate 는 @db.Date(UTC 자정).
      const todayKey = todayKstDateKey();
      const tournamentItems: SummaryItem[] = unwrapTournamentList(
        tournamentRes && tournamentRes.success ? tournamentRes.data : null,
      )
        .filter((t) => t.status === 'scheduled' || t.status === 'ongoing')
        .filter((t) => {
          const startKey = toDbDateKey(t.startDate);
          return startKey === null || startKey >= todayKey;
        })
        // [2026-08-04] myOnly — 참가 신청/확정한 대회만. 판정 기준은 아래 enrolled 와 동일.
        .filter((t) => {
          if (!myOnly) return true;
          const ids = t.enrolledChildIds ?? t.paidChildIds ?? [];
          return selectedChildId
            ? ids.includes(selectedChildId)
            : ids.length > 0;
        })
        .map((t) => ({
          kind: 'tournament',
          id: t.id,
          title: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          // [2026-06-17] 등록완료 판정 — 후불(POSTPAID)은 신청만으로, 선불은 결제완료(PAID).
          //   백엔드 enrolledChildIds 가 billingMode 별로 산출한 값(폴백: paidChildIds).
          //   선택 자녀 기준으로 한정 — 형제 등록이 선택 자녀에 '등록완료'로 표시되지 않도록.
          enrolled: selectedChildId
            ? !!(t.enrolledChildIds ?? t.paidChildIds)?.includes(selectedChildId)
            : ((t.enrolledChildIds ?? t.paidChildIds)?.length ?? 0) > 0,
          sortKey: toSortMs(t.startDate),
        }));

      // 각 그룹 내부 정렬 — 등록완료(결제) 항목을 위로, 그 다음 임박순(시작일시 오름차순).
      const byPriority = (a: SummaryItem, b: SummaryItem) => {
        // 등록완료(0) > 신청중(1) > 미신청(2) 순, 같은 그룹 안에서는 임박순.
        const rank = (i: SummaryItem) =>
          i.enrolled ? 0 : i.kind === 'class' && i.pending ? 1 : 2;
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return a.sortKey - b.sortKey;
      };
      // 유형별 최대 노출 수 — 훈련(수업)/대회를 각각 캡한 뒤 합쳐 다시 우선순위 정렬.
      //   classLimit/tournamentLimit 미지정 시 limit 폴백(기존 동작 호환).
      const maxClasses = classLimit ?? limit;
      const maxTournaments = tournamentLimit ?? limit;
      const cappedClasses = [...classItems].sort(byPriority).slice(0, maxClasses);
      const cappedTournaments = [...tournamentItems]
        .sort(byPriority)
        .slice(0, maxTournaments);
      // 훈련 그룹 위 → 대회 그룹 아래로 나열(통합 재정렬 없음). 각 그룹 내부만 byPriority 정렬.
      const merged = [...cappedClasses, ...cappedTournaments];
      setItems(merged);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, classLimit, tournamentLimit, selectedChildId, classesCategory, classesEndpoint, myOnly]);

  // 첫 로딩 완료 시 onReady(true) 1회 발화 — 에러/빈 응답에도 보장하여 로더 영구표시 방지.
  useEffect(() => {
    if (isLoading) return;
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    onReadyRef.current?.(true);
  }, [isLoading]);

  // ICETIMES flat: 섹션 자체가 full-bleed 흰 면(8px 회색 갭=mt-2). 내부 카드 박스/좌우 패딩 제거.
  //   기본 테마는 기존 px 래퍼 + 카드 박스 유지(픽셀 동일 — 타 역할 회귀 0).
  const Wrapper = iceTheme ? 'section' : 'div';
  return (
    <Wrapper className={cn(iceTheme && 'mt-2 bg-it-surface dark:bg-it-blue-950')}>
      <SectionHead
        title={MESSAGES.dashboard.links.classList}
        action={`${MESSAGES.dashboard.viewAll} ›`}
        onActionClick={() => navigate(targetPath)}
        iceTheme={iceTheme}
      />
      <div className={cn(iceTheme ? '' : 'px-4 sm:px-5')}>
        <div className={cn(
          iceTheme
            ? ''
            : 'rounded-w-xl border overflow-hidden bg-wsurface dark:bg-rink-800 shadow-sh-1 border-wline dark:border-rink-700',
        )}>
          {isLoading ? (
            // [2026-08-08 SLA] 게이트 완화 — 첫 fetch 동안 null 대신 실제 행 구조를
            //   미러링한 스켈레톤 3행. 실제 행(:479 `px-5 py-3` + 배지 pill + 제목
            //   단일행)과 동일 지오메트리라 데이터 교체 시 레이아웃 점프가 없다.
            //   role="status"+sr-only 로 스크린리더에도 로딩 상태를 안내한다.
            <div
              role="status"
              aria-busy="true"
              data-testid="team-classes-skeleton"
            >
              <span className="sr-only">{MESSAGES.common.loading}</span>
              <ul
                aria-hidden="true"
                className={cn(
                  'divide-y',
                  iceTheme
                    ? 'divide-it-line dark:divide-it-blue-800'
                    : 'divide-wline-2 dark:divide-rink-700',
                )}
              >
                {[0, 1, 2].map((i) => (
                  <li
                    key={`sk-${i}`}
                    className="flex items-center gap-2 px-5 py-3"
                  >
                    <span
                      className={cn(
                        'h-5 w-12 shrink-0 animate-pulse rounded-w-pill motion-reduce:animate-none',
                        iceTheme
                          ? 'bg-it-fill dark:bg-it-blue-900'
                          : 'bg-wline-2 dark:bg-rink-700',
                      )}
                    />
                    <span
                      className={cn(
                        'h-4 w-3/5 animate-pulse rounded motion-reduce:animate-none',
                        iceTheme
                          ? 'bg-it-fill dark:bg-it-blue-900'
                          : 'bg-wline-2 dark:bg-rink-700',
                      )}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
              <div className={cn(
                'flex h-11 w-11 items-center justify-center rounded-w-pill',
                iceTheme ? 'bg-it-fill dark:bg-it-blue-900' : 'bg-wline-2 dark:bg-rink-700',
              )}>
                <Icon
                  name="sports_hockey"
                  className="text-2xl text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-title font-semibold text-wtext-2 dark:text-rink-100">
                {myOnly
                  ? MESSAGES.dashboard.myClasses.emptyTitle
                  : MESSAGES.emptyByPersona.parent('수업')}
              </p>
              {/* [2026-08-04] myOnly 는 '내 것만' 보여주므로 비어 있으면 막다른 화면이 된다.
                  카탈로그(전체보기 대상)로 이어주는 진입점을 함께 노출한다. */}
              {myOnly && (
                <>
                  <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                    {MESSAGES.dashboard.myClasses.emptyDescription}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(targetPath)}
                    className="mt-2 inline-flex items-center gap-1.5 h-10 px-4 rounded-w-pill text-card-body font-bold bg-it-blue-500 text-white transition-colors motion-reduce:transition-none active:brightness-95"
                  >
                    <Icon name="search" className="text-[18px]" aria-hidden="true" />
                    {MESSAGES.dashboard.myClasses.emptyCta}
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className={cn(
              'divide-y',
              iceTheme ? 'divide-it-line dark:divide-it-blue-800' : 'divide-wline-2 dark:divide-rink-700',
            )}>
              {items.map((item) => {
                const isTournament = item.kind === 'tournament';
                // 수업: 타입 배지 / 대회: 'tournament' 고정 배지(red).
                const typeLabel = isTournament
                  ? TRAINING_TYPE_LABEL.tournament
                  : (item.trainingType && TRAINING_TYPE_LABEL[item.trainingType]) ??
                    '수업';
                const badgeClass = getTrainingTypeBadgeClass(
                  isTournament ? 'tournament' : item.trainingType,
                );
                const href = isTournament
                  ? `/tournaments/${item.id}`
                  : `/classes/${item.id}`;
                const ariaLabel = isTournament
                  ? `${item.title} 대회 상세 보기`
                  : `${item.title} 수업 상세 보기`;
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => navigate(href)}
                      className={cn(
                        // [2026-07-21] 시안 정합 — 좁은 px-4 py-2 → 공지 섹션과 동일한 편안한
                        //   px-5 py-3 간격 + items-center(단일행 세로 중앙정렬, chevron mt 오프셋 제거).
                        'w-full px-5 py-3 flex items-center gap-3 text-left transition-colors duration-150 motion-reduce:transition-none',
                        iceTheme ? 'hover:bg-it-fill dark:hover:bg-it-blue-900' : 'hover:bg-wline-2 dark:hover:bg-rink-700',
                      )}
                      aria-label={ariaLabel}
                    >
                      <div className="min-w-0 flex-1">
                        {/* [2026-06-16] 수업명 밑 정보(담당자·일정) 제거 — 유형 배지 + 수업명만 표시. */}
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              // [2026-07-21] 시안 정합 — 유형 배지 pill 좌우 패딩 px-1.5 → px-2 로
                              //   살짝 넓혀 라운드 pill 형태를 또렷하게(훈련=초록/대회=빨강 토큰 유지).
                              'shrink-0 rounded-w-pill px-2 py-0.5 text-card-meta font-bold',
                              badgeClass,
                            )}
                          >
                            {typeLabel}
                          </span>
                          <p
                            className={cn(
                              'truncate font-bold',
                              // ICETIMES(true): 시안 ListRow title 15.5px/700/-0.01em.
                              iceTheme
                                ? 'text-[15.5px] tracking-[-0.01em] text-it-ink-800 dark:text-white'
                                : 'text-card-title text-wtext-1 dark:text-white',
                            )}
                          >
                            {item.title}
                          </p>
                          {item.enrolled ? (
                            <span className="shrink-0 rounded-w-pill bg-mint-500/15 px-1.5 py-0.5 text-card-meta font-bold text-mint-600 dark:text-mint-500">
                              등록완료
                            </span>
                          ) : item.kind === 'class' && item.pending ? (
                            /* [2026-08-04] 신청·요청 대기 — 결제/승인 전이라 '등록완료'와 구분한다.
                               색은 상태 칩 관례(amber soft)를 따른다. */
                            <span className="shrink-0 rounded-w-pill bg-amber-50 px-1.5 py-0.5 text-card-meta font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                              {MESSAGES.dashboard.myClasses.pendingChip}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Icon
                        name="chevron_right"
                        className={cn(
                          // items-center 로 세로 중앙정렬되므로 mt 오프셋 제거(시안의 중앙 chevron).
                          'shrink-0 text-[18px]',
                          iceTheme
                            ? 'text-it-ink-300 dark:text-it-ink-400'
                            : 'text-wtext-4 dark:text-rink-500',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
