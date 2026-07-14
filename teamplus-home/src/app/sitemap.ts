import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/**
 * sitemap.xml — 검색엔진에 전체 공개 라우트를 제공.
 * 공개 마케팅 페이지만 포함(/admin·/api 제외).
 * priority/changeFrequency 는 페이지 성격에 맞춰 차등.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const routes: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  }> = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/features', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/solution', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/cases', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/news', priority: 0.6, changeFrequency: 'weekly' },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
