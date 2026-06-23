'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

/**
 * ParentSectionTitle - 섹션 제목 + 선택적 "전체보기" 링크
 *
 * SectionHeader와 유사하지만, parent 페이지 내부 섹션용으로
 * 좌측 컬러 바 + 제목 + 서브텍스트 구조를 가집니다.
 */
interface ParentSectionTitleProps {
  /** 섹션 제목 */
  title: string;
  /** 보조 텍스트 (제목 우측) */
  subtitle?: string;
  /** "전체보기" 링크 경로 */
  href?: string;
  /** 링크 텍스트 (기본: '전체보기') */
  linkText?: string;
  /** 추가 className */
  className?: string;
}

export function ParentSectionTitle({
  title,
  subtitle,
  href,
  linkText = '전체보기',
  className = '',
}: ParentSectionTitleProps) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 bg-ice-500 rounded-full" />
        <h3 className="text-card-section">
          {title}
        </h3>
        {subtitle && (
          <span className="text-card-meta">
            {subtitle}
          </span>
        )}
      </div>
      {href && (
        <NavLink
          href={href}
          className="flex items-center gap-0.5 text-card-meta font-medium hover:text-ice-500 transition-colors"
        >
          <span>{linkText}</span>
          <Icon
            name="chevron_right"
            className="text-sm"
            aria-hidden="true"
          />
        </NavLink>
      )}
    </div>
  );
}
