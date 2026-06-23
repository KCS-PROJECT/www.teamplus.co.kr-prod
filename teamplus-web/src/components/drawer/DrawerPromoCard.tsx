'use client';

import { type MouseEvent } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface DrawerPromoCardProps {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  icon?: string;
  onNavigate?: (href: string, e: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

/**
 * DrawerPromoCard — Drawer 내부 프로모션/안내 배너
 * 역할별 CTA (프리미엄 가입, 가이드, 신규 기능 등)
 * Primary 솔리드 컬러 + 장식 아이콘 (gradient/blur 금지)
 */
export function DrawerPromoCard({
  eyebrow,
  title,
  description,
  ctaLabel,
  href,
  icon = 'workspace_premium',
  onNavigate,
  className,
}: DrawerPromoCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-ice-500 text-white p-5 shadow-md',
        className,
      )}
    >
      {/* 장식 아이콘 (배경) */}
      <div
        className="absolute -right-4 -bottom-6 opacity-15 pointer-events-none"
        aria-hidden="true"
      >
        <Icon name={icon} className="text-[120px] leading-none" />
      </div>

      {/* 콘텐츠 */}
      <div className="relative z-10 flex flex-col gap-1">
        <p className="text-[10px] font-bold text-white/70 uppercase tracking-[0.15em]">
          {eyebrow}
        </p>
        <h4 className="text-base font-bold leading-snug">
          {title}
        </h4>
        <p className="text-xs text-white/80 mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>

      {/* CTA 버튼 */}
      <NavLink
        href={href}
        onClick={(e) => onNavigate?.(href, e)}
        className="relative z-10 inline-flex items-center gap-1 mt-3 bg-white text-ice-500 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-wbg active:scale-95 transition-transform motion-reduce:transition-none"
      >
        <span>{ctaLabel}</span>
        <Icon name="arrow_forward" className="text-sm" aria-hidden="true" />
      </NavLink>
    </div>
  );
}
