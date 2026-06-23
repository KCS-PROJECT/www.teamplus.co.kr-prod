'use client';

/**
 * AcademyStudentsTab — 학원 수강생 탭 본체 (수업 카드 IA + 검색 모드 학생 카드 전환)
 *
 * SPEC v3 2026-05-18 — `docs/Planning/SPEC_ACADEMY_STUDENTS_REDESIGN_V3.md`
 *
 * 모드 분기:
 *  - 기본 모드 (검색어 없음)     → useAcademyClassesSummary + 수업 카드 리스트
 *      · 활성 수업만 (status='active', isActive=true)
 *      · 수업 카드 클릭 → /classes/{cls.id}/students (Detail 페이지로 통일)
 *  - 검색 모드 (검색어 1자 이상) → useAcademyStudents + 학생 카드 리스트
 *      · debouncedQuery(300ms) 트리거
 *      · 학생 카드 수업 칩 클릭 → /classes/{classId}/students
 *
 * v2 자산 재활용: AcademyStudentCard (검색 모드 전용), AcademyStudentSearchBar.
 * v3 부활: AcademyClassCompactCard (기본 모드 수업 카드), `no-classes` empty.
 *
 * Race condition: 두 hook 내부에서 requestIdRef 로 stale 응답 차단. Tab 단의 enabled
 * 가드로 비활성 모드 fetch 자체를 차단해 모드 전환 race 도 방지.
 *
 * Page Ready: usePageReady + useStableLayout 합성. 데이터 fetch 완료 + sub-component
 * paint 완료 전까지 풀스크린 로더 hide 차단 (LOADING_TIMING_POLICY v16 §11).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { usePageReady } from '@/hooks/usePageReady';
import { useStableLayout } from '@/hooks/useStableLayout';
import {
  useAcademyClassesSummary,
  useAcademyStudents,
} from '@/hooks/useAcademyStudents';
import { AcademyClassCompactCard } from './AcademyClassCompactCard';
import { AcademyStudentCard } from './AcademyStudentCard';
import { AcademyStudentSearchBar } from './AcademyStudentSearchBar';
import { AcademyStudentEmpty } from './AcademyStudentEmpty';

interface AcademyStudentsTabProps {
  academyId: string;
}

export function AcademyStudentsTab({ academyId }: AcademyStudentsTabProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const isSearchMode = debouncedQuery.trim().length >= 1;

  // ─── 기본 모드: 활성 수업 카드 리스트 ─────────────────────────────────
  const {
    data: classesData,
    isLoading: isClassesLoading,
    errorMessage: classesError,
    refresh: refreshClasses,
  } = useAcademyClassesSummary(
    academyId,
    { status: 'active', sort: 'enrollment_count', page: 1, limit: 20 },
    { enabled: !isSearchMode },
  );

  // ─── 검색 모드: 학생 카드 리스트 + 무한스크롤 ──────────────────────────
  const {
    summary: studentsSummary,
    results: studentsResults,
    pagination: studentsPagination,
    isLoading: isStudentsLoading,
    isLoadingMore,
    hasMore,
    errorMessage: studentsError,
    loadMoreErrorMessage,
    debouncedQuery: debouncedStudentsQuery,
    refresh: refreshStudents,
    loadMore,
  } = useAcademyStudents(
    academyId,
    { q: query, sort: 'recent', limit: 20 },
    { enabled: isSearchMode },
  );

  // 모드별 로딩/에러/데이터 합성
  const isLoading = isSearchMode ? isStudentsLoading : isClassesLoading;
  const errorMessage = isSearchMode ? studentsError : classesError;
  const refresh = isSearchMode ? refreshStudents : refreshClasses;
  // 모드별 "데이터 도착" 가드 (LOADING_TIMING_POLICY v16 §11 — 데이터 완료 전 hide 차단)
  const hasData = isSearchMode
    ? studentsResults !== null && studentsSummary !== null && studentsPagination !== null
    : classesData !== null;

  // ─── 풀스크린 로더 타이밍: 데이터 + 레이아웃 stable 합성 ────────────────
  const mainRef = useRef<HTMLDivElement | null>(null);
  // [성능 2026-05-28 P0-A] 400→220ms. 레이아웃 디바운스 윈도우 단축 (데이터·이미지·폰트는 별도 신호가 보장).
  const isLayoutStable = useStableLayout(mainRef, { stableMs: 220 });
  usePageReady(!isLoading && hasData && isLayoutStable);

  // ─── 검색 모드 무한 스크롤 (IntersectionObserver) ─────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !isSearchMode || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: '120px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isSearchMode, hasMore, loadMore]);

  // ─── 헤더 요약 텍스트 ───────────────────────────────────────────────
  const summaryText = isSearchMode
    ? MESSAGES.academy.students.searchResultCount(studentsPagination?.total ?? 0)
    : classesData
    ? MESSAGES.academy.students.summary(
        classesData.summary.uniqueStudentCount,
        classesData.summary.activeClassCount,
      )
    : '';

  const handleClassCardClick = (classId: string) => {
    router.push(`/classes/${classId}/students`);
  };

  return (
    <div ref={mainRef} className="flex flex-col gap-4">
      {/* 헤더 — 요약 (SectionHead 텍스트 토큰 패턴, 카드 wrapping 제거)
          [수정 2026-05-18] 요약 카드(rounded-w-xl shadow-sh-1) → 인라인 텍스트 헤더로 단순화.
            수업 카드와 동일 디자인 토큰 사용으로 의미 구분 불명확하던 문제 해소.
            3-tier 시각 위계 명확화: 헤더(텍스트) → 검색(rounded-w-pill input) → 항목(카드).
            부모 main 의 px-5 padding 안에서 자연스럽게 정렬되도록 자체 px 미적용.
            SectionHead 컴포넌트 직접 사용 시 자체 px-4 sm:px-5 가 부모 px-5 와 중복되므로
            SectionHead 의 텍스트 토큰(tracking-[-0.02em] font-extrabold text-[15px] sm:text-[16px])
            만 채택. */}
      {summaryText && (
        <h2
          aria-label={MESSAGES.academy.students.summaryAriaLabel}
          className="text-wtext-1 dark:text-white tracking-[-0.02em] font-extrabold text-[15px] sm:text-[16px] break-keep"
        >
          {summaryText}
        </h2>
      )}

      {/* 헤더 — 검색 input (2줄, 모드 공통) */}
      <AcademyStudentSearchBar
        query={query}
        onQueryChange={setQuery}
        placeholder={MESSAGES.academy.students.searchStudentPlaceholder}
      />

      {/* 본문 */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex items-center justify-center py-10"
        >
          <div className="w-7 h-7 border-2 border-ice-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : errorMessage ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
            {MESSAGES.error.general}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className={cn(
              'inline-flex h-10 items-center gap-1 rounded-w-pill px-4',
              'bg-ice-500 text-white text-card-body font-bold',
              'hover:bg-ice-700 active:brightness-95',
              'transition-colors duration-150 motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
            )}
          >
            {MESSAGES.academy.students.retry}
          </button>
        </div>
      ) : isSearchMode ? (
        // ─── 검색 모드: 학생 카드 리스트 ─────────────────────────────
        studentsResults.length === 0 ? (
          <AcademyStudentEmpty
            variant="no-search-results"
            query={debouncedStudentsQuery}
          />
        ) : (
          <ul aria-live="polite" className="flex flex-col gap-2.5">
            {studentsResults.map((student) => (
              <li key={student.childId}>
                <AcademyStudentCard student={student} />
              </li>
            ))}
          </ul>
        )
      ) : (
        // ─── 기본 모드: 수업 카드 리스트 ─────────────────────────────
        !classesData || classesData.classes.length === 0 ? (
          <AcademyStudentEmpty variant="no-classes" />
        ) : (
          <ul aria-live="polite" className="flex flex-col gap-2">
            {classesData.classes.map((cls) => (
              <li key={cls.id}>
                <AcademyClassCompactCard
                  classData={cls}
                  onClick={handleClassCardClick}
                />
              </li>
            ))}
          </ul>
        )
      )}

      {/* 검색 모드 무한 스크롤 sentinel + load more 상태 */}
      {isSearchMode && !isLoading && studentsResults.length > 0 && (
        <div
          ref={sentinelRef}
          aria-busy={isLoadingMore}
          className="flex items-center justify-center py-4 min-h-[40px]"
        >
          {isLoadingMore ? (
            <span className="inline-flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
              <span className="w-4 h-4 border-2 border-ice-500 border-t-transparent rounded-full animate-spin" />
              {MESSAGES.academy.students.loadingMore}
            </span>
          ) : loadMoreErrorMessage ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              className={cn(
                'inline-flex items-center gap-1 rounded-w-pill px-3 py-1.5',
                'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-card-meta font-bold',
                'hover:bg-wline dark:hover:bg-rink-500 active:brightness-95',
                'transition-colors duration-150 motion-reduce:transition-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500',
              )}
            >
              <Icon name="refresh" className="text-[16px]" aria-hidden="true" />
              {MESSAGES.academy.students.retry}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default AcademyStudentsTab;
