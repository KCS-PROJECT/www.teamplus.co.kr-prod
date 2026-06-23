import Image from 'next/image';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  side?: 'left' | 'right';
};

const METAL_TEXTURE_STYLE = {
  backgroundImage: "url('/images/phone-metal-texture.png')",
  backgroundSize: '210px 210px',
} satisfies CSSProperties;

/**
 * 앱 스크린샷(1320x2868)을 감싸는 glossy black iPhone 스타일 프레임.
 * 화면 이미지는 유지하고, 외형만 JSON 목업 스펙처럼 메탈 깊이와 글라스를 만든다.
 */
export function PhoneFrame({
  src,
  alt,
  priority,
  className,
  sizes = '(max-width: 768px) 62vw, 300px',
  side = 'right',
}: Props) {
  const isLeft = side === 'left';
  const sideOffsetClass = isLeft
    ? '-left-[9px] rounded-l-[2.55rem]'
    : '-right-[9px] rounded-r-[2.55rem]';
  const sideInnerHighlightClass = isLeft ? 'right-[1px]' : 'left-[1px]';
  const sideOuterShadeClass = isLeft ? 'left-0' : 'right-0';

  return (
    <div
      className={cn(
        'relative [transform-style:preserve-3d]',
        className,
      )}
    >
      {/* 전면 실루엣과 붙어 보이는 얇은 메탈 하우징 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-[2px] z-[0] rounded-[2.76rem] bg-rink-800 shadow-sh-2 ring-1 ring-rink-500 [transform:translate3d(4px,5px,-10px)]"
        style={{
          ...METAL_TEXTURE_STYLE,
          backgroundPosition: 'center center',
        }}
      >
        <span aria-hidden className="absolute inset-x-8 top-[5px] h-px rounded-full bg-white/25" />
        <span aria-hidden className="absolute inset-x-9 bottom-[5px] h-px rounded-full bg-rink-puck/60" />
      </span>

      {/* 뒤쪽 깊이는 그림자처럼만 보이게 제한한다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[2px] z-[0] rounded-[2.58rem] bg-rink-900/90 shadow-sh-rink ring-1 ring-rink-700 [transform:translate3d(7px,8px,-18px)]"
        style={{
          ...METAL_TEXTURE_STYLE,
          backgroundPosition: '58% center',
        }}
      >
        <span aria-hidden className="absolute inset-x-9 top-4 h-px rounded-full bg-white/20" />
        <span aria-hidden className="absolute inset-x-10 bottom-5 h-px rounded-full bg-rink-puck/70" />
      </span>

      {/* 보이는 측면 레일: glossy black metal + brushed titanium edge */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-[2.4%] top-[2.4%] z-[1] w-4 overflow-hidden bg-rink-700 shadow-sh-1 ring-1 ring-rink-500 [transform:translate3d(0,3px,-9px)]',
          sideOffsetClass,
        )}
        style={{
          ...METAL_TEXTURE_STYLE,
          backgroundPosition: isLeft ? 'left center' : 'right center',
        }}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 w-px bg-white/40',
            sideInnerHighlightClass,
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 w-px bg-rink-puck/70',
            sideOuterShadeClass,
          )}
        />
        <span aria-hidden className="absolute left-0 right-0 top-[9%] h-px bg-rink-puck/70" />
        <span aria-hidden className="absolute left-0 right-0 bottom-[10%] h-px bg-rink-puck/70" />
        {isLeft ? (
          <>
            <span
              aria-hidden
              className="absolute right-[3px] top-[18%] h-6 w-[2px] rounded-full bg-rink-500/80 ring-1 ring-white/10"
            />
            <span
              aria-hidden
              className="absolute right-[3px] top-[29%] h-9 w-[2px] rounded-full bg-rink-500/80 ring-1 ring-white/10"
            />
            <span
              aria-hidden
              className="absolute right-[3px] top-[41%] h-9 w-[2px] rounded-full bg-rink-500/80 ring-1 ring-white/10"
            />
          </>
        ) : (
          <span
            aria-hidden
            className="absolute left-[3px] top-[25%] h-12 w-[2px] rounded-full bg-rink-500/80 ring-1 ring-white/10"
          />
        )}
      </span>

      {/* 하단 메탈 림 */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[-4px] left-8 right-8 z-[1] h-3 overflow-hidden rounded-b-[1.55rem] bg-rink-700 ring-1 ring-rink-500 [transform:translate3d(2px,0,-7px)]"
        style={{
          ...METAL_TEXTURE_STYLE,
          backgroundPosition: 'center bottom',
        }}
      >
        <span aria-hidden className="absolute inset-x-6 top-px h-px rounded-full bg-white/35" />
        <span aria-hidden className="absolute bottom-px left-1/2 h-px w-8 -translate-x-1/2 rounded-full bg-rink-puck/75" />
      </span>

      <div className="relative z-[3] rounded-[2.62rem] bg-rink-puck p-[0.5rem] shadow-sh-rink ring-1 ring-rink-700 [transform:translateZ(8px)]">
        {/* glossy black glass edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] rounded-[2.42rem] ring-1 ring-inset ring-white/22"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-12 top-12 z-[1] w-px bg-white/18',
            isLeft ? 'left-[4px]' : 'right-[4px]',
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-[4px] h-px rounded-full bg-white/24"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 bottom-[4px] h-px rounded-full bg-white/10"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-14 top-14 w-px bg-white/16',
            isLeft ? 'left-[5px]' : 'right-[5px]',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-14 top-14 w-px bg-rink-500/55',
            isLeft ? 'right-[5px]' : 'left-[5px]',
          )}
        />

        <div className="relative z-[2] overflow-hidden rounded-[2.06rem] bg-wbg ring-1 ring-rink-puck/60">
          <div className="relative aspect-[1320/2868] w-full">
            <Image
              src={src}
              alt={alt}
              fill
              priority={priority}
              sizes={sizes}
              className="object-cover object-top"
            />
          </div>
          {/* 유리 표면 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.22]"
          />
        </div>
      </div>
    </div>
  );
}
