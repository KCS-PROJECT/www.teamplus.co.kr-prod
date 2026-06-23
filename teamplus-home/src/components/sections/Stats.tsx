'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, ScanLine } from 'lucide-react';
import { STATS } from '@/lib/content';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

/**
 * 운영 변화 패널.
 * 큰 숫자 중심의 SaaS 템플릿 대신, 도입 후 어떤 일이 줄고 연결되는지 보여준다.
 */
export function Stats() {
  const [primary, ...benefits] = STATS;
  const flow = ['수업 편성', 'QR 출석', '크레딧 정리', '알림 공유'];

  return (
    <section aria-label="핵심 운영 메트릭" className="relative py-14 sm:py-20">
      <div className="container-site">
        <div className="grid gap-px overflow-hidden rounded-[1.5rem] border border-wline bg-wline shadow-sh-1 lg:grid-cols-[1.12fr_0.88fr]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: DUR.slow, ease: EASE_OUT }}
            className="bg-wsurface p-8 motion-reduce:transition-none motion-reduce:transform-none sm:p-10 lg:p-12"
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="section-eyebrow">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice-500" />
                운영 변화
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ice-50 px-3 py-1 text-[11px] font-semibold text-ice-700 ring-1 ring-ice-100">
                <ScanLine size={13} aria-hidden />
                {primary.value}
              </span>
            </div>

            <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
              팀플러스를 쓰면
              <br className="hidden sm:block" />
              운영이 덜 끊깁니다
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-wtext-3">
              {primary.description}
            </p>

            <ol className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-wline bg-wline sm:grid-cols-4">
              {flow.map((item, i) => (
                <li key={item} className="bg-wbg p-4">
                  <span className="font-num text-xs font-black text-ice-600">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-2 text-sm font-extrabold text-rink-900">{item}</p>
                </li>
              ))}
            </ol>
          </motion.div>

          <div className="relative flex flex-col gap-6 overflow-hidden bg-ice-50 p-8 text-rink-900 sm:p-10">
            <div>
              <p className="text-sm font-bold text-ice-700">좋아지는 점</p>
              <h3 className="mt-3 text-xl font-extrabold leading-snug text-rink-900">
                반복 확인을 줄이고, 같은 기록을 함께 봅니다
              </h3>
              <p className="mt-2 text-sm leading-6 text-wtext-3">
                빠른 숫자보다 중요한 것은 운영이 덜 끊기고, 덜 반복되고, 더 명확해지는 것입니다.
              </p>
            </div>

            <ul className="flex flex-col border-y border-ice-100">
              {benefits.map((s, i) => (
                <motion.li
                  key={s.label}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={VIEWPORT}
                  transition={{
                    duration: DUR.fast,
                    delay: stagger(i),
                    ease: EASE_OUT,
                  }}
                  className="border-t border-ice-100 py-4 first:border-t-0 motion-reduce:transition-none motion-reduce:transform-none"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ice-600" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-rink-900">
                        {s.value} {s.label}
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-wtext-3">{s.description}</p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
