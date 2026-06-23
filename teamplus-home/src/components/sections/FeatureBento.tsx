'use client';

import { motion } from 'framer-motion';
import { APP_FLOW } from '@/lib/content';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';
import { DUR, EASE_OUT, VIEWPORT, stagger } from '@/lib/motion';

/**
 * App flow — 카드 그리드 대신 실제 운영 순서가 보이는 행 기반 타임라인.
 * 템플릿식 bento 표현을 줄이고, 학부모가 겪는 하루의 흐름을 담담하게 보여준다.
 */
export function FeatureBento() {
  const flow = APP_FLOW;

  return (
    <section id="features" aria-label="앱 사용 흐름" className="section relative scroll-mt-24">
      <BackgroundMesh variant="section" />
      <div className="container-site">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="section-eyebrow">수업 하루 흐름</p>
            <h2 className="mt-5 max-w-xl text-3xl font-extrabold leading-tight text-rink-900 sm:text-5xl">
              하루 수업이 끝날 때까지
              <br className="hidden sm:block" />
              앱 하나로 따라갑니다
            </h2>
            <p className="mt-5 max-w-lg text-base leading-8 text-wtext-3">
              기능을 길게 나열하지 않고, 학부모가 실제로 앱을 쓰는 순서대로 보여줍니다. 수업 전 확인부터
              수업 후 기록까지 한 흐름으로 이어집니다.
            </p>

            <div className="mt-8 max-w-sm border-t border-wline pt-5">
              <p className="text-sm font-bold text-rink-900">하루에 네 번 확인하면 충분합니다.</p>
              <p className="mt-2 text-sm leading-6 text-wtext-3">
                일정, 출석, 기록, 정산이 같은 데이터로 이어지도록 설계했습니다.
              </p>
            </div>
          </div>

          <ol className="overflow-hidden rounded-[1.5rem] border border-wline bg-wsurface shadow-sh-1">
            {flow.map((item, index) => {
              return (
                <motion.li
                  key={item.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT}
                  transition={{
                    duration: DUR.fast,
                    delay: stagger(index),
                    ease: EASE_OUT,
                  }}
                  className="grid gap-4 border-t border-wline p-5 first:border-t-0 motion-reduce:transition-none motion-reduce:transform-none sm:grid-cols-[8rem_1fr] sm:gap-7 sm:p-7"
                >
                  <div className="flex items-center gap-3 sm:block">
                    <span className="font-num text-sm font-black text-ice-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-bold text-rink-900 sm:mt-2 sm:block">
                      {item.label}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-extrabold leading-snug text-rink-900 sm:text-xl">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-wtext-3">{item.description}</p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
