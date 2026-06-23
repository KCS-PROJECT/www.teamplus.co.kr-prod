'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

interface SubPageHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 뒤로가기 경로 (기본: 브라우저 뒤로가기) */
  backHref?: string;
  /** 우측 액션 영역 (선택) */
  rightAction?: React.ReactNode;
  /** 헤더 배경색 클래스 (기본: bg-white) */
  bgClassName?: string;
}

/**
 * 하위 페이지에서 공통으로 사용하는 뒤로가기 헤더
 * badges, stickers, checklist, gift 등 서브 페이지에서 반복 사용
 */
export function SubPageHeader({
  title,
  backHref,
  rightAction,
  bgClassName = 'bg-white dark:bg-rink-900',
}: SubPageHeaderProps) {
  return (
    <header
      className={`sticky top-0 z-10 ${bgClassName} border-b border-wline-2 dark:border-rink-800 px-4 h-16 flex items-center justify-between`}
    >
      {backHref ? (
        <NavLink
          href={backHref}
          className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white dark:bg-rink-800 shadow-sm border border-wline-2 dark:border-rink-700 active:brightness-95 transition-all"
          aria-label="뒤로 가기"
        >
          <Icon
            name="arrow_back_ios_new"
            className="text-xl text-wtext-2 dark:text-rink-100"
          />
        </NavLink>
      ) : (
        <button
          onClick={() => window.history.back()}
          className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white dark:bg-rink-800 shadow-sm border border-wline-2 dark:border-rink-700 active:brightness-95 transition-all"
          aria-label="뒤로 가기"
        >
          <Icon
            name="arrow_back_ios_new"
            className="text-xl text-wtext-2 dark:text-rink-100"
          />
        </button>
      )}
      <h1 className="text-xl font-extrabold text-wtext-1 dark:text-white tracking-tight">
        {title}
      </h1>
      {rightAction ?? <div className="w-10" aria-hidden="true" />}
    </header>
  );
}
