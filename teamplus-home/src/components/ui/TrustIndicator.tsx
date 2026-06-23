import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  description?: string;
  className?: string;
};

/**
 * 신뢰 지표 카드 — 보안/결제/인증 등 마케팅 trust signal
 * - 아이콘 + 큰 값 + 라벨 + 부가 설명 4단 구성
 * - DESIGN.md SoT 준수 (gradient 0, 컬러 그림자 0, 단일 액센트 ice)
 */
export function TrustIndicator({ icon: Icon, label, value, description, className }: Props) {
  return (
    <div
      className={cn(
        'group flex h-full items-start gap-4 rounded-2xl border border-wline bg-wsurface p-5 transition-colors hover:border-ice-100 sm:p-6',
        className,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ice-50 text-ice-600 ring-1 ring-ice-100">
        <Icon size={20} strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-wtext-4">
          {label}
        </p>
        <p className="mt-1 truncate text-base font-extrabold text-rink-900 sm:text-lg">
          {value}
        </p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-wtext-3 sm:text-sm">{description}</p>
        )}
      </div>
    </div>
  );
}
