'use client';

import { motion } from 'framer-motion';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { DUR, EASE_OUT } from '@/lib/motion';

type Screen = { src: string; alt: string };

type Props = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 앞쪽에 떠 있는 메인 폰 */
  primary: Screen;
  /** 뒤쪽 살짝 회전된 보조 폰(깊이감). 생략하면 단일 폰 히어로 */
  secondary?: Screen;
  children?: React.ReactNode;
};

/**
 * 메인(/) Hero 와 동일 어휘의 split 히어로 — 좌측 카피 + 우측 떠다니는 실제 앱 화면.
 * - 진입: framer-motion fade+y(좌/우 stagger) · primary 폰 `animate-float`(6s) · `motion-reduce` 가드.
 * - PageHeader(중앙 텍스트)와 달리 좌측 정렬 + 디바이스로 서브 페이지 상단에 제품 실감을 준다.
 * - 디바이스 슬레이트(PhoneFrame)·back panel(ice-50)만 사용 — gradient/blur/컬러 그림자 0.
 */
export function PageHero({ eyebrow, title, description, primary, secondary, children }: Props) {
  return (
    <section className="relative isolate overflow-hidden pt-20 pb-20 lg:pb-28">
      <BackgroundMesh variant="hero" />
      <div className="container-site">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE_OUT }}
            className="max-w-2xl motion-reduce:transition-none motion-reduce:transform-none"
          >
            {eyebrow && (
              <span className="section-eyebrow">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
                {eyebrow}
              </span>
            )}
            <h1 className="mt-6 text-[clamp(2.1rem,4.6vw,3.85rem)] font-black leading-[1.06] tracking-normal text-balance text-rink-900">
              {title}
            </h1>
            {description && (
              <p className="mt-6 max-w-2xl text-base leading-8 text-wtext-3 sm:text-lg">
                {description}
              </p>
            )}
            {children}
          </motion.div>

          {/* Right — floating device(s) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, delay: 0.15, ease: EASE_OUT }}
            className="relative mx-auto w-full max-w-[380px] lg:mx-0 lg:max-w-none"
          >
            {/* back panel — 은은한 깊이감 (장식) */}
            <div
              aria-hidden
              className="absolute inset-x-6 top-8 bottom-10 rounded-[2.75rem] bg-ice-50 ring-1 ring-ice-100"
            />
            {secondary && (
              <div
                aria-hidden
                className="absolute right-[16%] top-12 z-[1] hidden w-[50%] max-w-[198px] origin-center sm:block lg:right-[12%] [transform:perspective(1020px)_rotateY(-13deg)_rotateZ(11deg)_translateZ(-18px)] [transform-style:preserve-3d]"
              >
                <PhoneFrame
                  src={secondary.src}
                  alt={secondary.alt}
                  sizes="198px"
                  side="right"
                />
              </div>
            )}
            <div
              className={[
                'relative z-[2] animate-float motion-reduce:animate-none',
                secondary
                  ? 'mx-auto w-[68%] max-w-[268px] sm:mx-0 sm:ml-1 lg:ml-8'
                  : 'mx-auto w-[64%] max-w-[252px]',
              ].join(' ')}
            >
              <PhoneFrame
                src={primary.src}
                alt={primary.alt}
                priority
                sizes="(max-width: 768px) 58vw, 268px"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
