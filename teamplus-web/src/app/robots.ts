import type { MetadataRoute } from 'next';

// 유효한 robots.txt 제공 — 기존엔 /robots.txt 요청에 SPA fallback HTML(200)이 반환되어
// Google Search Console 색인 오류("사용자가 선택한 표준이 없는 중복 페이지")의 원인이 됐다.
// Disallow 하지 않는 이유: 크롤을 차단하면 Googlebot이 layout.tsx의 noindex 메타를 읽지 못해
// 이미 색인된 페이지가 제거되지 않는다 (Google 공식 가이드 — noindex와 robots.txt 차단 병용 금지).
// 색인이 모두 제거된 뒤 원하면 disallow: '/' 로 전환 가능.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
  };
}
