'use client';

import { useEffect, useState } from 'react';

interface CountUpProps {
  end: string | number;
  duration?: number;
  separator?: string;
  className?: string;
}

export function CountUp({ end, duration = 2000, separator = ',', className }: CountUpProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    // Parse the end value (remove non-numeric characters except dot)
    const endValue = typeof end === 'string' 
      ? parseFloat(end.replace(/[^0-9.]/g, '')) 
      : end;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Easing function (easeOutExpo)
      const easeOutExpo = (x: number): number => {
        return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
      };

      const currentCount = progress === 1 
        ? endValue 
        : Math.floor(easeOutExpo(progress) * endValue);

      setCount(currentCount);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [end, duration]);

  // Format the number with commas
  const formattedCount = count.toLocaleString('en-US').replace(/,/g, separator);

  return <span className={className}>{formattedCount}</span>;
}
