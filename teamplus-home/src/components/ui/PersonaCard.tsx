import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  role: string;
  subtitle: string;
  icon: LucideIcon;
  bullets: string[];
  highlight?: boolean;
  className?: string;
};

/**
 * 페르소나 카드 — 6 역할(Parent/Coach/Director/Child/Teen/Admin) 표시용
 * - 라이트 카드 + 슬레이트 아이콘 박스
 * - 강조 시 ice-50 배경, 그렇지 않으면 wsurface
 * - DESIGN.md SoT 준수 (gradient 0, 컬러 그림자 0)
 */
export function PersonaCard({
  role,
  subtitle,
  icon: Icon,
  bullets,
  highlight,
  className,
}: Props) {
  return (
    <article
      className={cn(
        'group flex h-full flex-col gap-5 rounded-[var(--radius-card)] border p-6 shadow-sh-1 transition-colors',
        highlight
          ? 'border-ice-100 bg-ice-50 hover:border-ice-200'
          : 'border-wline bg-wsurface hover:border-ice-100',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl shadow-sh-rink',
            highlight ? 'bg-ice-500' : 'bg-rink-900',
          )}
        >
          <Icon size={20} className="text-white" strokeWidth={1.7} />
        </span>
        <span
          className={cn(
            'text-[11px] font-bold uppercase tracking-[0.12em]',
            highlight ? 'text-ice-700' : 'text-wtext-4',
          )}
        >
          {subtitle}
        </span>
      </div>

      <h3 className="text-xl font-extrabold leading-snug text-rink-900">{role}</h3>

      <ul className="mt-auto space-y-2.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm leading-6 text-wtext-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ice-500" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
