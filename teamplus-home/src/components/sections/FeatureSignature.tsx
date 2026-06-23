'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { FEATURE_SIGNATURE } from '@/lib/content';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { RinkLines } from '@/components/ui/RinkLines';
import { DUR, EASE_OUT, VIEWPORT } from '@/lib/motion';

/**
 * 시그니처 워크플로 — features 의 단 하나뿐인 "주연 장면".
 * - 라이트 캔버스(흰 표면)에 거대 숫자 타이포 + 실제 앱 화면 2장 → 다크 카드 반복 차단.
 *   (다크 슬레이트는 디바이스 프레임으로만 등장, 섹션 카드로 반복하지 않음.)
 * - 4단계 흐름을 화살표로 연결 → "8개가 따로가 아니라 한 흐름"을 시각적으로 증명.
 */
export function FeatureSignature() {
  const s = FEATURE_SIGNATURE;

  return (
    <section aria-label="시그니처 흐름" className="section bg-wsurface">
      <div className="container-site">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* left — narrative */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="motion-reduce:transition-none motion-reduce:transform-none"
          >
            <p className="section-eyebrow normal-case tracking-[0.04em]">
              <span className="h-1.5 w-1.5 rounded-full bg-ice-500" />
              {s.kicker}
            </p>
            <h2 className="mt-5 text-display-lg font-black leading-[1.06] text-rink-900">
              {s.headlineTop}
              <br />
              {s.headlineBottom}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-wtext-3">{s.description}</p>

            {/* signature stat — 거대 숫자 한 컷 */}
            <div className="mt-9 flex items-end gap-4">
              <span className="font-num text-[clamp(3.5rem,9vw,5.5rem)] font-black leading-none tracking-tight text-ice-500 tabular-nums">
                {s.stat.value}
              </span>
              <span className="mb-2 text-sm font-bold text-wtext-2">{s.stat.label}</span>
            </div>

            {/* 4-step flow — 화살표 연결(카드 아님) */}
            <ol className="mt-10 flex flex-wrap items-start gap-y-5">
              {s.flow.map((f, i) => (
                <li key={f.step} className="flex items-start">
                  <div>
                    <p className="text-sm font-extrabold text-rink-900">{f.step}</p>
                    <p className="mt-1 max-w-[9rem] text-xs leading-5 text-wtext-4">{f.note}</p>
                  </div>
                  {i < s.flow.length - 1 && (
                    <ArrowRight
                      size={16}
                      strokeWidth={2.2}
                      className="mx-3 mt-1 shrink-0 text-ice-400 sm:mx-4"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>
          </motion.div>

          {/* right — real screens (light stage) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: DUR.slow, ease: EASE_OUT }}
            className="relative isolate motion-reduce:transition-none motion-reduce:transform-none"
          >
            <RinkLines
              variant="faceoff"
              className="absolute -right-8 -top-8 -z-10 h-56 w-56 text-ice-200/70 sm:h-72 sm:w-72"
            />
            <div className="flex items-end justify-center gap-4 sm:gap-6">
              <figure className="w-[44%] max-w-[196px] translate-y-7">
                <PhoneFrame src={s.screens[1].src} alt={`${s.screens[1].cap} 화면`} sizes="196px" />
                <figcaption className="mt-3 text-center text-[11px] font-bold text-wtext-3">
                  {s.screens[1].cap}
                </figcaption>
              </figure>
              <figure className="w-[52%] max-w-[236px]">
                <PhoneFrame
                  src={s.screens[0].src}
                  alt={`${s.screens[0].cap} 화면`}
                  priority
                  sizes="236px"
                />
                <figcaption className="mt-3 text-center text-[11px] font-bold text-wtext-3">
                  {s.screens[0].cap}
                </figcaption>
              </figure>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
