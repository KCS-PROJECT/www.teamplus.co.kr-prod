"use client";

/**
 * VenueSearchSheet — 장소(링크장) 검색 선택 바텀시트 (공용)
 *
 * 검색칸에 입력하면 저장된 링크장 목록을 필터해 보여주고, 목록 탭 시 링크장을
 * 선택한다. `allowFreeText` 컨텍스트(예: 대회 — tournaments.location /
 * hockey_matches.venue_name 자유 텍스트 저장 지원)에서는 검색칸 우측 [적용]
 * 버튼·Enter·모바일 키보드 액션 키로 입력 텍스트를 그대로 장소로 확정할 수 있다.
 *
 * 동작 규칙:
 *  - 목록 탭 → onSelectVenue(링크장) + 닫힘
 *  - [적용]/Enter/액션 키 → onApplyText(입력 텍스트) + 닫힘 (allowFreeText 전용,
 *    빈 텍스트 적용 = 장소 미지정 해제)
 *  - X·오버레이·뒤로가기 닫기 → 취소(아무 변경 없음)
 *  - allowFreeText=false 면 [적용] 미렌더링, Enter 는 무시 — 검색칸은 순수 필터
 *
 * 한글 IME 조합 중 Enter(isComposing)는 조합 확정이므로 적용으로 처리하지 않는다.
 */

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { useDebounce } from "@/hooks/useDebounce";
import { useVenues } from "@/hooks/useClassForm";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

export interface VenueSearchSheetVenue {
  id: string;
  name: string;
  address?: string;
}

export interface VenueSearchSheetProps {
  isOpen: boolean;
  /** 닫기(취소) — 값 변경 없이 시트만 닫는다. */
  onClose: () => void;
  /** 시트 제목 (예: "대회장소 선택", "1경기 장소 선택") */
  title: string;
  /** 현재 선택된 링크장 id — 목록 하이라이트용 */
  selectedVenueId?: string;
  /** 열릴 때 검색칸에 프리필할 현재 값(선택 링크장명 또는 자유 텍스트) */
  initialQuery?: string;
  /** 자유 텍스트 확정([적용]·Enter) 허용 — FK 전용 컨텍스트는 false(기본) */
  allowFreeText?: boolean;
  /** 목록에서 링크장 탭 — 호출 후 시트가 닫힌다. */
  onSelectVenue: (venue: VenueSearchSheetVenue) => void;
  /** 입력 텍스트 그대로 확정 — allowFreeText=true 일 때만 호출. 빈 문자열 = 해제. */
  onApplyText?: (text: string) => void;
  /** ICETIMES(it-*) 토큰 변형 — 공유 컴포넌트 컨벤션상 기본 false */
  iceTheme?: boolean;
}

export function VenueSearchSheet({
  isOpen,
  onClose,
  title,
  selectedVenueId,
  initialQuery = "",
  allowFreeText = false,
  onSelectVenue,
  onApplyText,
  iceTheme = false,
}: VenueSearchSheetProps) {
  const { venues } = useVenues();
  const [query, setQuery] = useState(initialQuery);
  // 열릴 때마다 현재 값으로 프리필 (닫힘 상태 편집 잔상 제거)
  useEffect(() => {
    if (isOpen) setQuery(initialQuery);
  }, [isOpen, initialQuery]);

  // 한글 IME 조합 중간값마다 재필터되지 않도록 입력이 멈춘 뒤에만 검색.
  const debouncedQuery = useDebounce(query, 250);
  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.address ?? "").toLowerCase().includes(q),
    );
  }, [debouncedQuery, venues]);

  const applyText = () => {
    if (!allowFreeText) return;
    onApplyText?.(query.trim());
    onClose();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // 모바일 키보드 액션 키(완료/이동)도 Enter keydown 으로 들어온다.
    e.preventDefault();
    // 한글 조합 확정 Enter 는 적용으로 처리하지 않는다.
    if (e.nativeEvent.isComposing) return;
    applyText();
  };

  const handleSelect = (venue: VenueSearchSheetVenue) => {
    onSelectVenue(venue);
    onClose();
  };

  const msg = MESSAGES.venue.searchSheet;

  return (
    // 고정 높이 — 검색 결과 개수에 따라 시트 크기가 출렁이지 않도록 h-[75vh] 고정,
    // 목록은 내부 스크롤(ClassForm 훈련 장소 시트와 동일 방식).
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxHeight="75vh"
      className="h-[75vh]"
    >
      {/* 검색칸(상단 고정) + 목록(내부 스크롤) — 시트 높이 고정과 세트 */}
      <div className="flex h-full min-h-0 flex-col">
      {/* 검색칸 + [적용] */}
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-w-md px-4 py-3 transition-colors motion-reduce:transition-none",
            iceTheme
              ? "border-[1.5px] border-it-line-strong bg-it-fill dark:border-rink-600 dark:bg-rink-700"
              : "border border-wline-2 bg-wsurface dark:border-rink-600 dark:bg-rink-700",
          )}
        >
          <Icon
            name="search"
            className={cn(
              "shrink-0 text-xl",
              iceTheme ? "text-it-ink-400" : "text-wtext-3",
            )}
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            enterKeyHint={allowFreeText ? "done" : "search"}
            placeholder={msg.searchPrompt}
            aria-label={title}
            autoFocus
            className={cn(
              "w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0",
              iceTheme
                ? "text-it-ink-800 placeholder:text-it-ink-400 dark:text-white"
                : "text-wtext-1 placeholder:text-wtext-3 dark:text-white",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={msg.clearQuery}
              className={cn(
                "shrink-0 transition-colors motion-reduce:transition-none",
                iceTheme
                  ? "text-it-ink-400 hover:text-it-ink-600"
                  : "text-wtext-3 hover:text-wtext-2",
              )}
            >
              <Icon name="close" className="text-base" />
            </button>
          )}
        </div>
        {allowFreeText && (
          <button
            type="button"
            onClick={applyText}
            className={cn(
              "shrink-0 rounded-w-md px-4 py-3 text-sm font-bold text-white transition-colors motion-reduce:transition-none active:brightness-95",
              iceTheme
                ? "bg-it-blue-500 hover:bg-it-blue-600"
                : "bg-ice-500 hover:bg-ice-600",
            )}
          >
            {msg.apply}
          </button>
        )}
      </div>

      {/* 결과 목록 — 검색어가 있을 때만 노출 (VenuePicker·ClassForm 동일 패턴) */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-3">
        {!debouncedQuery.trim() ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div
              className={cn(
                "mb-3 flex h-14 w-14 items-center justify-center rounded-full",
                iceTheme ? "bg-it-fill dark:bg-rink-700" : "bg-wline-2 dark:bg-rink-700",
              )}
            >
              <Icon
                name="search"
                className={cn(
                  "text-2xl",
                  iceTheme ? "text-it-ink-400" : "text-wtext-3",
                )}
                aria-hidden="true"
              />
            </div>
            <p
              className={cn(
                "text-sm font-medium",
                iceTheme
                  ? "text-it-ink-500 dark:text-rink-300"
                  : "text-wtext-3 dark:text-rink-300",
              )}
            >
              {msg.searchPrompt}
            </p>
            {allowFreeText && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  iceTheme
                    ? "text-it-ink-400 dark:text-rink-400"
                    : "text-wtext-4 dark:text-rink-400",
                )}
              >
                {msg.freeTextNotice}
              </p>
            )}
          </div>
        ) : filtered.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {filtered.map((v) => {
              const isSelected = !!selectedVenueId && v.id === selectedVenueId;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() =>
                      handleSelect({ id: v.id, name: v.name, address: v.address })
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-w-md p-4 text-left transition-colors motion-reduce:transition-none active:brightness-95",
                      iceTheme
                        ? isSelected
                          ? "border-2 border-it-blue-500 bg-it-blue-500/5"
                          : "border-[1.5px] border-it-line-strong bg-it-fill hover:border-it-blue-500/30 dark:border-rink-700 dark:bg-rink-900/50"
                        : isSelected
                          ? "border-2 border-ice-500 bg-ice-500/5"
                          : "border border-wline-2 bg-wbg hover:border-ice-500/30 dark:border-rink-700 dark:bg-rink-900/50",
                    )}
                  >
                    <Icon
                      name="location_on"
                      className={cn(
                        "shrink-0 text-xl",
                        isSelected
                          ? iceTheme
                            ? "text-it-blue-500"
                            : "text-ice-500"
                          : iceTheme
                            ? "text-it-ink-400"
                            : "text-wtext-3",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-bold",
                          iceTheme
                            ? "text-it-ink-800 dark:text-white"
                            : "text-wtext-1 dark:text-white",
                        )}
                      >
                        {v.name}
                      </span>
                      {v.address && (
                        <span
                          className={cn(
                            "block truncate text-xs",
                            iceTheme
                              ? "text-it-ink-500 dark:text-rink-300"
                              : "text-wtext-3 dark:text-rink-300",
                          )}
                        >
                          {v.address}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Icon
                        name="check"
                        className={cn(
                          "shrink-0 text-xl",
                          iceTheme ? "text-it-blue-500" : "text-ice-500",
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <p
              className={cn(
                "text-sm font-medium",
                iceTheme
                  ? "text-it-ink-500 dark:text-rink-300"
                  : "text-wtext-3 dark:text-rink-300",
              )}
            >
              {msg.noResult(debouncedQuery.trim())}
            </p>
            {allowFreeText && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  iceTheme
                    ? "text-it-ink-400 dark:text-rink-400"
                    : "text-wtext-4 dark:text-rink-400",
                )}
              >
                {msg.freeTextNotice}
              </p>
            )}
          </div>
        )}
      </div>
      </div>
    </BottomSheet>
  );
}

export default VenueSearchSheet;
