'use client';

/**
 * TeamPickerSheet — 회원가입 시 팀 선택 바텀시트
 *
 * 학부모/코치 가입 공용. 비로그인 상태에서 `/api/v1/teams/public` 을 호출하여
 * 팀 검색·페이지네이션·선택을 제공한다. 사용자가 팀을 [선택하기] 하면
 * 부모 컴포넌트로 `{ id, teamCode, name }` 을 전달하고 시트를 닫는다.
 *
 * SoT: DESIGN.md §3(토큰) · §4(Pattern) · §6.5(모션) · §7(절대 금지)
 *  - gradient/backdrop-blur/컬러 그림자 0건
 *  - 토큰만 사용 (ice/wbg/wsurface/wline/wtext/rink/shadow-sh-*)
 *  - 한글 라벨은 MESSAGES.team.picker* 만 사용 (하드코딩 금지)
 *  - 모션: 리스트 animate-fade-in(200ms, delay 0) + 시트 sheet-up + motion-reduce:animate-none
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useDebounce } from '@/hooks/useDebounce';
import { listPublicTeams, type TeamListItem } from '@/services/team.service';
import { MESSAGES } from '@/lib/messages';

const PAGE_SIZE = 20;

export interface TeamPickerSelection {
  /** 선택된 팀의 불변 ID (Team.id). 가입 페이로드의 teamId 로 전송됨 */
  id: string;
  /** 선택된 팀의 고유 코드 (Team.teamCode). 미설정 팀은 빈 문자열 */
  teamCode: string;
  /** 표시용 팀 이름 (verifiedTeamName 에 저장됨) */
  name: string;
}

export interface TeamPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: TeamPickerSelection) => void;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 시트 내부 콘텐츠(검색 input·리스트 행·선택 버튼)를 it-* 톤으로 스왑.
   *   **BottomSheet 컨테이너(담당 외)·검색·페이지네이션 로직은 동결, 비주얼만.**
   *   (children/add 호출처만 전달)
   */
  iceTheme?: boolean;
}

interface LoadState {
  items: TeamListItem[];
  offset: number;
  /** 마지막 페이지가 가득 찼는지(=다음 페이지 존재 가능) — 응답 길이로 판정해 빈 요청 루프 방지 */
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

const INITIAL_STATE: LoadState = {
  items: [],
  offset: 0,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  error: null,
};

export const TeamPickerSheet = memo(function TeamPickerSheet({
  isOpen,
  onClose,
  onSelect,
  iceTheme = false,
}: TeamPickerSheetProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [state, setState] = useState<LoadState>(INITIAL_STATE);
  // 현재 진행 중 요청 식별자 — 빠른 검색어 변경 시 stale 응답 무시
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (query: string, offset: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      setState((prev) => ({
        ...prev,
        isLoading: !append,
        isLoadingMore: append,
        error: null,
      }));
      try {
        const res = await listPublicTeams({
          ...(query && { search: query }),
          limit: PAGE_SIZE,
          offset,
        });
        if (requestId !== requestIdRef.current) return;
        if (res.success && res.data) {
          setState((prev) => ({
            items: append ? [...prev.items, ...res.data!] : res.data!,
            offset: offset + res.data!.length,
            // 받아온 페이지가 PAGE_SIZE 만큼 가득 찼을 때만 다음 페이지 존재 가능.
            // 미만(0 포함)이면 마지막 페이지 → 무한 스크롤 빈 요청 루프 방지.
            hasMore: res.data!.length === PAGE_SIZE,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isLoadingMore: false,
            error: res.error?.message ?? MESSAGES.team.pickerLoadFailed,
          }));
        }
      } catch {
        if (requestId !== requestIdRef.current) return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isLoadingMore: false,
          error: MESSAGES.team.pickerLoadFailed,
        }));
      }
    },
    [],
  );

  // 닫힐 때 상태 리셋
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setState(INITIAL_STATE);
      requestIdRef.current++; // 진행 중 요청 무효화
    }
  }, [isOpen]);

  // 검색 시에만 첫 페이지 로드. 노출 절제 — 검색어가 비어있으면 전체 목록을
  //   자동 노출하지 않고 안내만 보여준다(검색한 팀만 선택 가능).
  useEffect(() => {
    if (!isOpen) return;
    if (!debouncedSearch) {
      setState(INITIAL_STATE);
      return;
    }
    fetchPage(debouncedSearch, 0, false);
  }, [debouncedSearch, isOpen, fetchPage]);

  const handleLoadMore = useCallback(() => {
    fetchPage(debouncedSearch, state.offset, true);
  }, [debouncedSearch, state.offset, fetchPage]);

  // 무한 스크롤 — sentinel 이 뷰포트에 들어오면 다음 페이지 자동 로드.
  //   하단 200px 앞서 로드(rootMargin)해 끊김 없이 이어진다.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          state.hasMore &&
          !state.isLoadingMore &&
          !state.isLoading
        ) {
          handleLoadMore();
        }
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.hasMore, state.isLoadingMore, state.isLoading, handleLoadMore]);

  const handlePick = useCallback(
    (team: TeamListItem) => {
      const id = team.id ?? '';
      const teamCode = team.teamCode ?? '';
      const name = team.name ?? team.club?.clubName ?? '';
      // 식별은 불변 id 기준 — 팀 코드 미설정 팀도 선택 가능
      if (!id || !name) return;
      onSelect({ id, teamCode, name });
    },
    [onSelect],
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.team.pickerTitle}
      maxHeight="75vh"
    >
      {/* 검색 — 시트 상단 고정(스크롤 시 유지, 키보드가 입력란을 가리지 않음) */}
      <div
        className={
          iceTheme
            ? 'sticky top-0 z-10 -mx-5 bg-it-surface px-5 pb-3 pt-1 dark:bg-rink-800'
            : 'sticky top-0 z-10 -mx-5 bg-wsurface px-5 pb-3 pt-1 dark:bg-rink-800'
        }
      >
        {iceTheme ? (
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-it-ink-400 dark:text-rink-300">
              <Icon name="search" size={18} aria-hidden="true" />
            </span>
            <input
              type="text"
              inputMode="search"
              placeholder={MESSAGES.team.pickerSearchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={MESSAGES.team.pickerSearchPlaceholder}
              className="w-full h-12 pl-11 pr-3.5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-it-ink-800 dark:text-white text-card-body placeholder:text-it-ink-400 dark:placeholder:text-rink-300 focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500 transition-colors motion-reduce:transition-none"
            />
          </div>
        ) : (
          <Input
            type="text"
            inputMode="search"
            icon="search"
            placeholder={MESSAGES.team.pickerSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={MESSAGES.team.pickerSearchPlaceholder}
          />
        )}
      </div>

      {/* 본문 — 로딩 / 에러 / 빈 상태 / 리스트 */}
      <div className="mt-1">
          {state.isLoading ? (
            <div
              className="py-12 text-center text-card-meta text-wtext-3 dark:text-rink-300"
              role="status"
              aria-live="polite"
            >
              <Icon
                name="hourglass_empty"
                className="text-2xl text-wtext-4 dark:text-rink-500 motion-reduce:animate-none animate-pulse"
                aria-hidden="true"
              />
              <p className="mt-2">{MESSAGES.loading.standard}</p>
            </div>
          ) : state.error ? (
            <div
              className="py-12 text-center text-card-body text-flame-500"
              role="alert"
            >
              <Icon
                name="error_outline"
                className="text-2xl"
                aria-hidden="true"
              />
              <p className="mt-2">{state.error}</p>
            </div>
          ) : !debouncedSearch ? (
            <div
              className="py-12 text-center text-card-meta text-wtext-3 dark:text-rink-300"
              role="status"
            >
              <Icon
                name="search"
                className="text-2xl text-wtext-4 dark:text-rink-500"
                aria-hidden="true"
              />
              <p className="mt-2">{MESSAGES.team.pickerSearchPrompt}</p>
            </div>
          ) : state.items.length === 0 ? (
            <div
              className="py-12 text-center text-card-meta text-wtext-3 dark:text-rink-300"
              role="status"
            >
              <Icon
                name="search_off"
                className="text-2xl text-wtext-4 dark:text-rink-500"
                aria-hidden="true"
              />
              <p className="mt-2">{MESSAGES.team.pickerEmpty}</p>
            </div>
          ) : (
            <ul className="space-y-2" role="list">
              {state.items.map((team) => {
                const teamName = team.name ?? team.club?.clubName ?? '';
                const coachName = team.coachName ?? '';
                const disabled = !team.id || !teamName;
                return (
                  <li
                    key={team.id}
                    className="animate-fade-in motion-reduce:animate-none"
                  >
                    <div
                      className={
                        iceTheme
                          ? 'flex items-center gap-3 p-4 rounded-w-md border border-it-line dark:border-rink-700 bg-it-surface dark:bg-rink-800'
                          : 'flex items-center gap-3 p-4 rounded-w-md border border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800 shadow-sh-1 transition-shadow motion-reduce:transition-none duration-200'
                      }
                    >
                      <span
                        className={
                          iceTheme
                            ? 'flex size-10 shrink-0 items-center justify-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-500'
                            : 'flex size-10 shrink-0 items-center justify-center rounded-w-pill bg-wbg dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                        }
                        aria-hidden="true"
                      >
                        <Icon name="groups" className="text-card-title" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={
                            iceTheme
                              ? 'text-card-body font-semibold text-it-ink-900 dark:text-white truncate'
                              : 'text-card-body font-semibold text-wtext-1 dark:text-white truncate'
                          }
                        >
                          {teamName}
                        </p>
                        <p
                          className={
                            iceTheme
                              ? 'text-card-meta text-it-ink-500 dark:text-rink-300 truncate'
                              : 'text-card-meta text-wtext-3 dark:text-rink-300 truncate'
                          }
                        >
                          {coachName || '-'}
                        </p>
                      </div>
                      {iceTheme ? (
                        <button
                          type="button"
                          onClick={() => handlePick(team)}
                          disabled={disabled}
                          className="shrink-0 inline-flex items-center justify-center min-h-[36px] px-3.5 rounded-w-pill border-[1.5px] border-it-blue-500 bg-it-surface dark:bg-rink-800 text-card-meta font-bold text-it-blue-600 dark:text-it-blue-300 transition-colors motion-reduce:transition-none hover:bg-it-blue-50 dark:hover:bg-it-blue-900/40 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {MESSAGES.team.pickerSelectAction}
                        </button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handlePick(team)}
                          disabled={disabled}
                          className="shrink-0"
                        >
                          {MESSAGES.team.pickerSelectAction}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 무한 스크롤 sentinel + 하단 로딩 인디케이터 (스피너 = "더 있음" 신호) */}
          {!state.isLoading && !state.error && state.hasMore && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center py-4"
            >
              {state.isLoadingMore && (
                <span className="inline-flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
                  <Icon
                    name="hourglass_empty"
                    className="motion-reduce:animate-none animate-pulse text-[18px]"
                    aria-hidden="true"
                  />
                  {MESSAGES.loading.inProgress}
                </span>
              )}
            </div>
          )}
        </div>
    </BottomSheet>
  );
});
