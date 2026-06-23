'use client';

/**
 * VenuePicker — 공통 빙상장/홈구장/링크장 선택 컴포넌트
 *
 * 모든 홈구장·구장·링크장 선택 컨텍스트의 단일 진입점.
 * - 트리거: 현재 선택된 venue 이름을 표시하는 버튼 (디자인 토큰 준수)
 * - 시트: BottomSheetSelector — 바닥에서 슬라이드 업, 목록 많으면 내부 스크롤
 * - 데이터: useVenues hook (GET /venues?limit=100 — 5분 캐시)
 * - 화면 중앙 초과 시 max-height 85vh 로 자동 제한 + 내부 스크롤 보장
 *
 * @example
 *   <VenuePicker value={venueId} onChange={setVenueId} placeholder="홈 링크장 선택" />
 */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BottomSheetSelector, type BottomSheetSelectorItem } from '@/components/ui/BottomSheetSelector';
import { useVenues } from '@/hooks/useClassForm';
import { cn } from '@/lib/utils';

export interface VenuePickerProps {
  /** 현재 선택된 venue.id (빈 문자열이면 미선택) */
  value: string;
  /** 선택 변경 콜백 — 빈 문자열 전달 시 "선택 안 함" */
  onChange: (venueId: string) => void;
  /** 트리거 버튼 placeholder (미선택 시 표시) */
  placeholder?: string;
  /** BottomSheet 헤더 제목 (생략 시 "링크장을 선택해주세요.") */
  sheetTitle?: string;
  /** 접근성 라벨 */
  ariaLabel?: string;
  /** "선택 안 함" 옵션 표시 여부 (기본 true) */
  allowClear?: boolean;
  /** disabled 상태 */
  disabled?: boolean;
  /** 추가 클래스 (트리거 버튼) */
  className?: string;
}

export function VenuePicker({
  value,
  onChange,
  placeholder = '링크장 선택',
  sheetTitle = '링크장을 선택해주세요.',
  ariaLabel,
  allowClear = true,
  disabled = false,
  className,
}: VenuePickerProps) {
  const { venues } = useVenues();
  const [isOpen, setIsOpen] = useState(false);

  // 현재 선택된 venue 정보
  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === value),
    [venues, value],
  );

  // BottomSheetSelector items 변환 — "선택 안 함" 옵션 + venue 목록
  const items = useMemo<BottomSheetSelectorItem<string>[]>(() => {
    const result: BottomSheetSelectorItem<string>[] = [];
    if (allowClear) {
      result.push({
        id: '',
        name: '선택 안 함',
        icon: 'block',
        selected: value === '',
      });
    }
    for (const v of venues) {
      result.push({
        id: v.id,
        name: v.name,
        sub: v.address,
        icon: 'place',
        selected: v.id === value,
      });
    }
    return result;
  }, [venues, value, allowClear]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  const displayText = selectedVenue?.name ?? placeholder;
  const isPlaceholder = !selectedVenue;

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        aria-label={ariaLabel ?? sheetTitle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'h-12 w-full rounded-[12px] bg-white dark:bg-rink-800 border border-wline dark:border-rink-700',
          'px-4 flex items-center gap-2.5 text-left transition-colors',
          'motion-reduce:transition-none',
          'hover:border-ice-500 focus-visible:outline-none focus-visible:border-ice-500',
          'focus-visible:shadow-[0_0_0_3px_rgb(47_95_255_/_0.1)]',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        <Icon
          name="place"
          size={16}
          className="text-wtext-3 dark:text-rink-300 shrink-0"
          aria-hidden="true"
        />
        <span
          className={cn(
            'flex-1 text-card-body font-semibold tabular-nums truncate',
            isPlaceholder
              ? 'text-wtext-3 dark:text-rink-300'
              : 'text-wtext-1 dark:text-white',
          )}
        >
          {displayText}
        </span>
        <Icon
          name="expand_more"
          size={18}
          className="text-wtext-3 dark:text-rink-300 shrink-0"
          aria-hidden="true"
        />
      </button>

      <BottomSheetSelector
        isOpen={isOpen}
        title={sheetTitle}
        items={items}
        onSelect={handleSelect}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

export default VenuePicker;
