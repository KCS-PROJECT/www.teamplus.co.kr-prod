'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  duration?: number;
  className?: string;
};

/**
 * 숫자 카운팅 애니메이션 — 문자열 prefix/suffix 자동 분리
 * (예: "99.6%" → prefix "" · number 99.6 · suffix "%")
 */
export function AnimatedCounter({ value, duration = 1400, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // reduced-motion 가드 — RAF 카운트업은 framer-motion MotionConfig 보호 밖이므로
    // 자체 감지 필수. 감지 시 카운트업 없이 최종값 즉시 표시(빈 화면·0 고정 방지).
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(value);
      return;
    }

    const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
    if (!match) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = match;
    const target = parseFloat(numStr.replace(/,/g, ''));
    if (!Number.isFinite(target)) {
      setDisplay(value);
      return;
    }
    const decimals = (numStr.split('.')[1] ?? '').length;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const v = target * eased;
            setDisplay(
              `${prefix}${v.toLocaleString('ko-KR', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              })}${suffix}`,
            );
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          io.disconnect();
        });
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
