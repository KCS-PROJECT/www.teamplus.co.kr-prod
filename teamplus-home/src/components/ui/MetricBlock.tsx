import { cn } from '@/lib/utils';

type Props = {
  value: string;
  label: string;
  description?: string;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
  className?: string;
};

/**
 * 큰 metric 디스플레이 블록 — 마케팅 임팩트용
 * - text-display-lg + font-num 토큰 사용 (DESIGN.md M1)
 * - light: 흰 배경, dark: rink-900 슬레이트 배경
 * - 컬러 그림자/gradient 없음 (RULE-1)
 */
export function MetricBlock({
  value,
  label,
  description,
  align = 'left',
  tone = 'light',
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <p
        className={cn(
          'font-num text-[clamp(2.25rem,4.5vw,3.5rem)] font-black leading-[1] tracking-tight',
          tone === 'light' ? 'text-rink-900' : 'text-white',
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          'text-sm font-semibold uppercase tracking-[0.08em]',
          tone === 'light' ? 'text-ice-600' : 'text-ice-300',
        )}
      >
        {label}
      </p>
      {description && (
        <p
          className={cn(
            'text-sm leading-6',
            tone === 'light' ? 'text-wtext-3' : 'text-white/65',
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
