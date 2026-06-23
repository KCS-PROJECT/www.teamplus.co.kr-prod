'use client';

import { useState, useEffect } from 'react';

/**
 * 숫자가 올라가는 애니메이션 Hook
 */
export function useCountUp(
  end: number, 
  duration: number = 2000, 
  start: number = 0, 
  trigger: boolean = true
) {
  const [count, setCount] = useState(start);

  useEffect(() => {
    if (!trigger) return;
    
    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = currentTime - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      // Easing function (easeOutExpo)
      const ease = (x: number): number => {
        return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
      };
      
      setCount(Math.floor(start + (end - start) * ease(percentage)));

      if (progress < duration) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [end, duration, start, trigger]);

  return count;
}
