/**
 * 시그니처 모션 상수 — teamplus-home 전역 SoT (P1-1)
 *
 * 모든 섹션의 스크롤 인뷰 리빌이 한 호흡으로 이어지도록 ease / duration / stagger / viewport 를
 * 단일 출처로 묶는다. 이전에는 `[0.22,1,0.36,1]`·`[0.21,0.47,0.32,0.98]` 등 ease 가 섹션마다
 * 혼재하고 stagger·viewport margin 도 제각각이었다.
 *
 * 강도 가드("정제된 휴먼"): y 이동 ≤ 24px, duration ≤ 0.8s, 누적 stagger ≤ 280ms.
 * reduced-motion 은 framer-motion `MotionConfig(reducedMotion="user")` 가 전역 처리한다.
 * 단, RAF 기반 `AnimatedCounter` 는 MotionConfig 보호 밖이라 자체 가드를 둔다
 * (`src/components/ui/AnimatedCounter.tsx` 참고).
 */

/** 시그니처 ease — 기존 다수파(ease-out) 채택 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 표준 duration 스케일 */
export const DUR = { fast: 0.45, base: 0.6, slow: 0.8 } as const;

/** stagger step (40~60ms 권장 — DESIGN 모션 표준) */
export const STAGGER = 0.06;

/** 최대 누적 지연 — DESIGN 280ms cap 정합 */
export const STAGGER_CAP = 0.28;

/** 공통 viewport — 한 번만 재생(재진입 반복 깜빡임 0) */
export const VIEWPORT = { once: true, margin: '-60px' } as const;

/** 공통 리빌 variant — 아래에서 위로 페이드인 */
export const revealUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
} as const;

/** 인덱스 기반 stagger 지연(초) — cap 적용 */
export const stagger = (i: number) => Math.min(i * STAGGER, STAGGER_CAP);
