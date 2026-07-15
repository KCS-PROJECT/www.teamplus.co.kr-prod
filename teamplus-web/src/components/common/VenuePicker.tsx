'use client';

/**
 * VenuePicker — 공통 빙상장/홈구장/링크장 선택 컴포넌트 (검색형 인라인)
 *
 * 텍스트 입력 시에만 매칭 장소가 드롭다운으로 노출되고, 항목 클릭으로 확정한다.
 * 페이지 레벨 장소 선택은 공용 바텀시트(VenueSearchSheet)를 사용하고, 이 컴포넌트는
 * **바텀시트/모달 내부**처럼 시트를 중첩할 수 없는 컨텍스트 전용이다
 * (예: 수업 일정 회차 수정 시트 — select 전체 목록 노출 금지 요구사항 대응).
 *
 * - 선택: 드롭다운 항목 클릭 → 확정. 선택 후 "선택 해제 (장소 미지정)" 노출.
 * - 데이터: 기본 useVenues hook (GET /venues?limit=100) — `venues` prop 주입 시 자체 조회 생략.
 *
 * @example
 *   <VenuePicker value={venueId} onChange={setVenueId} placeholder="장소 찾아보기" />
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useDebounce } from '@/hooks/useDebounce';
import { useVenues } from '@/hooks/useClassForm';
import { cn } from '@/lib/utils';

export interface VenuePickerVenue {
  id: string;
  name: string;
  address?: string;
}

export interface VenuePickerProps {
  /** 현재 선택된 venue.id (빈 문자열이면 미선택) */
  value: string;
  /** 선택 변경 콜백 — 빈 문자열 전달 시 "선택 안 함" */
  onChange: (venueId: string) => void;
  /** 검색 input placeholder (미선택 시 표시) */
  placeholder?: string;
  /** 호환용 — 검색형 전환으로 미사용(구 바텀시트 제목). 시그니처만 보존. */
  sheetTitle?: string;
  /** 접근성 라벨 */
  ariaLabel?: string;
  /** "선택 해제" 허용 여부 (기본 true) */
  allowClear?: boolean;
  /** disabled 상태 */
  disabled?: boolean;
  /** 추가 클래스 (래퍼) */
  className?: string;
  /** 장소 목록 직접 주입 — 호출측이 이미 보유한 목록 재사용(자체 fetch 생략) */
  venues?: VenuePickerVenue[];
  /** ICETIMES(it-*) 토큰 변형 — 공유 컴포넌트 컨벤션상 기본 false */
  iceTheme?: boolean;
}

export function VenuePicker({
  value,
  onChange,
  placeholder = '장소 찾아보기',
  ariaLabel,
  allowClear = true,
  disabled = false,
  className,
  venues: venuesProp,
  iceTheme = false,
}: VenuePickerProps) {
  const { venues: fetchedVenues } = useVenues();
  const venues = venuesProp ?? fetchedVenues;
  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === value),
    [venues, value],
  );

  // 검색어(=input 표시값). 선택 시 venue.name 으로 채워지고, 타이핑하면 선택 해제 후 재검색.
  const [query, setQuery] = useState('');
  // 한글 IME 조합 중간값마다 재검색되지 않도록 입력 멈춘 뒤에만 필터.
  const debouncedQuery = useDebounce(query, 250);

  // value(선택) 변화 / venues 지연 로드 시 input 에 선택된 장소명 반영.
  useEffect(() => {
    setQuery(selectedVenue ? selectedVenue.name : '');
  }, [selectedVenue]);

  // 검색어가 있을 때만 필터. (빈 검색어면 드롭다운 자체를 띄우지 않음)
  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return venues.filter((v) => v.name.toLowerCase().includes(q));
  }, [debouncedQuery, venues]);

  // 드롭다운이 overflow 컨테이너(바텀시트 본문 등) 안에서 잘려 보이지 않도록,
  // 열리는 시점에 가시 영역으로 스크롤 노출. 페이지 컨텍스트에서는 no-op 수준.
  const dropdownVisible = !value && Boolean(debouncedQuery.trim());
  const dropdownRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (dropdownVisible) {
      dropdownRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [dropdownVisible]);

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'h-12 w-full px-4 flex items-center gap-2.5 transition-colors motion-reduce:transition-none',
          iceTheme
            ? 'rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill focus-within:border-it-blue-500 focus-within:bg-it-surface dark:border-rink-700 dark:bg-rink-800'
            : 'rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 focus-within:border-ice-500 focus-within:shadow-[0_0_0_3px_rgb(47_95_255_/_0.1)]',
          disabled && 'opacity-50',
        )}
      >
        <Icon
          name="place"
          size={16}
          className={cn(
            'shrink-0',
            iceTheme ? 'text-it-ink-400' : 'text-wtext-3 dark:text-rink-300',
          )}
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(''); // 타이핑 시 기존 선택 해제 → 재검색
          }}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          autoComplete="off"
          className={cn(
            'flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-card-body font-semibold',
            iceTheme
              ? 'text-it-ink-800 placeholder:text-it-ink-400 dark:text-white dark:placeholder:text-rink-300'
              : 'text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-rink-300',
          )}
        />
        {value && (
          <Icon
            name="check_circle"
            size={16}
            className={cn(
              'shrink-0',
              iceTheme ? 'text-it-blue-500' : 'text-ice-500',
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {value ? (
        allowClear && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setQuery('');
            }}
            className={cn(
              'mt-1 inline-flex items-center gap-1 text-w-caption font-semibold underline',
              iceTheme
                ? 'text-it-ink-500 dark:text-rink-300'
                : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            선택 해제 (장소 미지정)
          </button>
        )
      ) : dropdownVisible ? (
        /* absolute 오버레이 — 결과 개수에 따라 아래 콘텐츠가 밀리지 않게 한다. */
        <ul
          ref={dropdownRef}
          className={cn(
            'absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg shadow-sh-2',
            iceTheme
              ? 'border-[1.5px] border-it-line-strong bg-it-surface divide-y divide-it-line dark:border-rink-700 dark:bg-rink-800 dark:divide-rink-700'
              : 'border border-wline-2 dark:border-rink-700 divide-y divide-wline-2 dark:divide-rink-700 bg-white dark:bg-rink-800',
          )}
        >
          {filtered.length > 0 ? (
            filtered.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(v.id);
                    setQuery(v.name);
                  }}
                  className={cn(
                    'w-full px-4 py-2.5 text-left transition-colors motion-reduce:transition-none',
                    iceTheme
                      ? 'hover:bg-it-fill dark:hover:bg-rink-700'
                      : 'hover:bg-wline-2 dark:hover:bg-rink-700',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name="place"
                      size={14}
                      className={cn(
                        'shrink-0',
                        iceTheme
                          ? 'text-it-ink-400'
                          : 'text-wtext-3 dark:text-rink-300',
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'flex-1 text-card-body font-semibold truncate',
                        iceTheme
                          ? 'text-it-ink-800 dark:text-white'
                          : 'text-wtext-1 dark:text-white',
                      )}
                    >
                      {v.name}
                    </span>
                  </div>
                  {v.address && (
                    <div
                      className={cn(
                        'mt-0.5 pl-6 text-w-caption truncate',
                        iceTheme
                          ? 'text-it-ink-500 dark:text-rink-300'
                          : 'text-wtext-3 dark:text-rink-300',
                      )}
                    >
                      {v.address}
                    </div>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li
              className={cn(
                'px-4 py-3 text-w-caption',
                iceTheme
                  ? 'text-it-ink-500 dark:text-rink-300'
                  : 'text-wtext-3 dark:text-rink-300',
              )}
            >
              검색 결과가 없습니다.
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default VenuePicker;
