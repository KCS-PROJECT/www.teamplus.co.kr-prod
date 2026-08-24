'use client';

// 바텀시트 선택 행 — 아이콘 + 이름 + 선택 체크.
// 단위 공지의 "select형 트리거 + 바텀시트" 패턴 공용 행:
// 관리 공지함 단위 필터 · 공지 작성 대상 픽커가 공유한다.

import { Icon } from '@/components/ui/Icon';

export function SheetSelectRow({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center gap-2.5 rounded-w-md px-3 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-it-blue-900/40 active:brightness-95"
    >
      {icon && (
        <Icon
          name={icon}
          className={`text-[16px] shrink-0 ${active ? 'text-it-blue-500' : 'text-it-ink-400 dark:text-it-ink-300'}`}
          aria-hidden="true"
        />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-[14.5px] ${
          active
            ? 'font-extrabold text-it-blue-600 dark:text-it-blue-300'
            : 'font-semibold text-it-ink-800 dark:text-white'
        }`}
      >
        {label}
      </span>
      {active && (
        <Icon
          name="check"
          className="text-[18px] shrink-0 text-it-blue-500"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
