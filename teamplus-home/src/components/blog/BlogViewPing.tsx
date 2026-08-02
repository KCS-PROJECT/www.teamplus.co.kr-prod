'use client';

/**
 * BlogViewPing — 블로그 실측 조회수 비콘 (렌더 없음).
 *
 * 상세 페이지가 실제로 열람될 때 1회 `/api/blog-view` 로 POST 해 조회수를 올린다.
 * - ISR 캐시 뒤의 서버 fetch 와 달리 브라우저에서 실행되므로 "실제 열람" 기준 집계.
 * - sessionStorage 가드로 같은 브라우저 세션에서는 글당 1회만 전송(새로고침 스팸 방지).
 * - JS 를 실행하지 않는 크롤러/봇은 집계되지 않는다(오히려 정확도 이점).
 * - 실패는 조용히 무시 — 조회수는 부가 지표라 페이지 UX 에 영향을 주지 않는다.
 */
import { useEffect } from 'react';

export function BlogViewPing({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    const key = `blog-viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage 불가(프라이빗 모드 등) → 가드 없이 1회 전송
    }
    void fetch('/api/blog-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => undefined);
  }, [slug]);

  return null;
}
