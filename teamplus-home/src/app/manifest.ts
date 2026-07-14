import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/content';

/**
 * PWA Web App Manifest — 모바일 검색/설치 신호 + 브랜드 일관성.
 * home 은 다크 테마(themeColor #05060B) 기준.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
    short_name: BRAND.name,
    description: BRAND.descriptor,
    start_url: '/',
    display: 'standalone',
    background_color: '#05060B',
    theme_color: '#05060B',
    lang: 'ko',
    categories: ['sports', 'business', 'productivity'],
    icons: [
      {
        src: '/images/splash_logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
