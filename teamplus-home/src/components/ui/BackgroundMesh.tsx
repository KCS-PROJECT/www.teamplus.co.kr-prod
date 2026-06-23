import { cn } from '@/lib/utils';
import { RinkLines } from '@/components/ui/RinkLines';

type Props = {
  variant?: 'hero' | 'section' | 'soft';
  className?: string;
};

/**
 * 섹션 배경의 절제된 브랜드 표면.
 * pointer-events-none · aria-hidden 으로 장식용 처리.
 */
export function BackgroundMesh({ variant = 'section', className }: Props) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}>
      {variant === 'hero' && (
        <>
          <div className="absolute inset-x-0 top-0 h-[520px] bg-ice-50" />
          <div className="absolute inset-x-0 top-[519px] h-px bg-wline" />
          <RinkLines
            variant="faceoff"
            className="absolute -right-24 top-12 h-[320px] w-[320px] text-ice-100 sm:h-[420px] sm:w-[420px]"
          />
        </>
      )}
      {variant === 'section' && (
        <>
          <div className="absolute inset-x-0 top-0 h-px bg-wline" />
        </>
      )}
      {variant === 'soft' && (
        <div className="absolute inset-0 bg-white/45" />
      )}
    </div>
  );
}
