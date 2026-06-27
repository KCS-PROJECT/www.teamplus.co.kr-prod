import Image from 'next/image';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** 호환용 — claude/design `.phone` 프레임은 대칭이라 좌/우 구분을 쓰지 않는다. */
  side?: 'left' | 'right';
};

/**
 * `.phone-body::before` 메탈 백킹 — #1F2536 베이스 + 브러시드 메탈 텍스처(210px, 중앙).
 * `translate3d(5px,6px,0)` 로 우·하단으로 노출되어 메탈 질감이 드러난다.
 */
const METAL_BACKING_STYLE = {
  backgroundColor: '#1F2536',
  backgroundImage: "url('/images/phone-metal-texture.png')",
  backgroundSize: '210px 210px',
  backgroundPosition: 'center',
  boxShadow: '0 2px 6px rgba(20,24,38,.10), 0 6px 16px rgba(20,24,38,.12)',
  transform: 'translate3d(5px,6px,0)',
} satisfies CSSProperties;

/**
 * 앱 스크린샷(1320x2868)을 감싸는 glossy black iPhone 프레임.
 *
 * claude/design `팀플러스 홈페이지.html` 의 `.phone` / `.phone-body`(::before 메탈 백킹 · ::after 글라스 엣지)
 * / `.phone-screen` CSS 를 그대로 재현한다 — 우·하단 가장자리에 브러시드 메탈 텍스처가 드러나는 클린 룩.
 */
export function PhoneFrame({
  src,
  alt,
  priority,
  className,
  sizes = '(max-width: 768px) 62vw, 300px',
}: Props) {
  return (
    <div className={cn('relative', className)}>
      {/* .phone-body — 글로시 블랙 바디 + 외곽 메탈 라인 */}
      <div
        className="relative z-[3] rounded-[2.62rem] bg-rink-puck p-2"
        style={{
          boxShadow: '0 8px 24px rgba(20,24,38,.32)',
          outline: '1px solid #2A3247',
          outlineOffset: '-1px',
        }}
      >
        {/* ::before — 메탈 백킹 (우·하단으로 노출되어 메탈 텍스처가 보인다) */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[2px] -z-[2] rounded-[2.76rem]"
          style={METAL_BACKING_STYLE}
        />

        {/* ::after — 글라스 엣지 하이라이트 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] z-[4] rounded-[2.42rem]"
          style={{
            boxShadow:
              'inset 0 0 0 1px rgba(255,255,255,.22), inset 0 1px 0 rgba(255,255,255,.10)',
          }}
        />

        {/* .phone-screen — 실제 앱 화면 */}
        <div
          className="relative z-[2] overflow-hidden rounded-[2.06rem] bg-wbg"
          style={{ outline: '1px solid rgba(10,13,20,.6)', outlineOffset: '-1px' }}
        >
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
        </div>
      </div>
    </div>
  );
}
