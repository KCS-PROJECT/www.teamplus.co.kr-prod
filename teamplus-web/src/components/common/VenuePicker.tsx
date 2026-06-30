'use client';

/**
 * VenuePicker — 공통 빙상장/홈구장/링크장 선택 컴포넌트 (검색형)
 *
 * 모든 홈구장·구장·링크장 선택 컨텍스트의 단일 진입점.
 * - 입력: 장소 검색 input — 텍스트 입력 시 매칭 장소만 드롭다운 노출(검색어 있을 때만).
 * - 선택: 드롭다운 항목 클릭 → 확정. 선택 후 "선택 해제 (장소 미지정)" 노출.
 * - 데이터: useVenues hook (GET /venues?limit=100 — 5분 캐시) → 클라이언트 필터.
 *
 * 바텀시트(BottomSheetSelector) → 검색형으로 교체. MultiDatePickerModal 의 장소
 * '찾아보기' 패턴(검색어가 있을 때만 결과 노출)을 단일 선택용으로 차용한다.
 *
 * @example
 *   <VenuePicker value={venueId} onChange={setVenueId} placeholder="홈 링크장 검색" />
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useVenues } from '@/hooks/useClassForm';
import { cn } from '@/lib/utils';

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
}

export function VenuePicker({
  value,
  onChange,
  placeholder = '장소 찾아보기',
  ariaLabel,
  allowClear = true,
  disabled = false,
  className,
}: VenuePickerProps) {
  const { venues } = useVenues();
  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === value),
    [venues, value],
  );

  // 검색어(=input 표시값). 선택 시 venue.name 으로 채워지고, 타이핑하면 선택 해제 후 재검색.
  const [query, setQuery] = useState('');

  // value(선택) 변화 / venues 지연 로드 시 input 에 선택된 장소명 반영.
  useEffect(() => {
    setQuery(selectedVenue ? selectedVenue.name : '');
  }, [selectedVenue]);

  // 검색어가 있을 때만 필터. (빈 검색어면 드롭다운 자체를 띄우지 않으므로 전체 반환은 무의미)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) => v.name.toLowerCase().includes(q));
  }, [query, venues]);

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'h-12 w-full rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700',
          'px-4 flex items-center gap-2.5 transition-colors motion-reduce:transition-none',
          'focus-within:border-ice-500 focus-within:shadow-[0_0_0_3px_rgb(47_95_255_/_0.1)]',
          disabled && 'opacity-50',
        )}
      >
        <Icon
          name="place"
          size={16}
          className="text-wtext-3 dark:text-rink-300 shrink-0"
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
          className="flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-card-body font-semibold text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-rink-300"
        />
        {value && (
          <Icon
            name="check_circle"
            size={16}
            className="text-ice-500 shrink-0"
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
            className="mt-1 inline-flex items-center gap-1 text-w-caption font-semibold text-wtext-3 dark:text-rink-300 underline"
          >
            선택 해제 (장소 미지정)
          </button>
        )
      ) : query.trim() ? (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-wline-2 dark:border-rink-700 divide-y divide-wline-2 dark:divide-rink-700 bg-white dark:bg-rink-800">
          {filtered.length > 0 ? (
            filtered.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(v.id);
                    setQuery(v.name);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name="place"
                      size={14}
                      className="text-wtext-3 dark:text-rink-300 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-card-body font-semibold text-wtext-1 dark:text-white truncate">
                      {v.name}
                    </span>
                  </div>
                  {v.address && (
                    <div className="mt-0.5 pl-6 text-w-caption text-wtext-3 dark:text-rink-300 truncate">
                      {v.address}
                    </div>
                  )}
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-w-caption text-wtext-3 dark:text-rink-300">
              검색 결과가 없습니다.
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default VenuePicker;
