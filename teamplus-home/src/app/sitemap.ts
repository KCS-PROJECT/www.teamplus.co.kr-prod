import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { getPublishedBlogSlugs } from '@/lib/blog-api';

// 블로그 발행 글을 재배포 없이 sitemap 에 반영 — ISR(1시간).
export const revalidate = 3600;

/**
 * sitemap.xml — 검색엔진에 전체 공개 라우트를 제공.
 * 공개 마케팅 페이지만 포함(/admin·/api 제외).
 * priority/changeFrequency 는 페이지 성격에 맞춰 차등.
 * 블로그 상세글은 backend 발행 목록에서 동적으로 추가한다.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
    { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/news', priority: 0.6, changeFrequency: 'weekly' },
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.map(
    ({ path, priority, changeFrequency }) => ({
      url: absoluteUrl(path),
      lastModified,
      changeFrequency,
      priority,
    }),
  );

  // 블로그 상세글(발행) — backend 조회 실패 시 정적 항목만 반환(방어).
  const blogPosts = await getPublishedBlogSlugs();
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map(({ slug, updatedAt }) => ({
    url: absoluteUrl(`/blog/${slug}`),
    lastModified: updatedAt ? new Date(updatedAt) : lastModified,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries];
}
