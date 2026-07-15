/**
 * 랜딩 블로그 — teamplus-backend 공개 API fetch 헬퍼 (서버 전용).
 *
 * 데이터 소스: teamplus-backend `GET /api/v1/blog`(목록) · `GET /api/v1/blog/:slug`(상세).
 *   두 엔드포인트는 @Public 이라 인증 없이 서버사이드에서 직접 호출한다.
 * 응답 래핑: backend 전역 ResponseEnvelopeInterceptor 가 `{ success, data }` 로 감싸므로
 *   `body.data` 를 언래핑한다(없으면 원본 사용 — 방어).
 * 캐시: fetch `next.revalidate` 로 ISR 데이터 캐시(발행 글을 재배포 없이 반영).
 */

export type BlogCategory = 'NEWS' | 'GUIDE' | 'EVENT' | 'PRESS';

export interface BlogListItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: BlogCategory;
  coverImageUrl?: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  pinned: boolean;
  viewCount: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogDetail extends BlogListItem {
  content: string;
  authorId?: string | null;
}

export interface BlogListResult {
  items: BlogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 카테고리 라벨 + 라이트 캔버스용 칩 토큰(다크 색 사용 금지 — 흰 카드 위). */
export const BLOG_CATEGORY_META: Record<
  BlogCategory,
  { label: string; chip: string }
> = {
  NEWS: { label: '소식', chip: 'bg-ice-50 text-ice-700 ring-ice-200' },
  GUIDE: { label: '가이드', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  EVENT: { label: '이벤트', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  PRESS: { label: '보도자료', chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
};

export const BLOG_CATEGORIES: BlogCategory[] = ['NEWS', 'GUIDE', 'EVENT', 'PRESS'];

const REVALIDATE_SECONDS = 300;

/** backend API base — contact route 와 동일한 env 해석(운영/개발 자동 대응). */
function apiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.BACKEND_URL ??
    'http://localhost:5003/api/v1';
  const base = raw.replace(/\/+$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T } & Record<string, unknown>;
    return (body?.data ?? (body as unknown as T)) ?? null;
  } catch {
    return null;
  }
}

export async function getBlogList(params: {
  page?: number;
  pageSize?: number;
  category?: string;
}): Promise<BlogListResult> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 12;
  const usp = new URLSearchParams();
  usp.set('page', String(page));
  usp.set('pageSize', String(pageSize));
  if (params.category) usp.set('category', params.category);

  const data = await fetchJson<BlogListResult>(`${apiBase()}/blog?${usp.toString()}`);
  return data ?? { items: [], total: 0, page, pageSize };
}

export async function getBlogBySlug(slug: string): Promise<BlogDetail | null> {
  return fetchJson<BlogDetail>(`${apiBase()}/blog/${encodeURIComponent(slug)}`);
}

/** sitemap 용 — 발행글 slug + 갱신일(최대 100건). */
export async function getPublishedBlogSlugs(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  const data = await fetchJson<BlogListResult>(`${apiBase()}/blog?pageSize=100`);
  return (data?.items ?? []).map((i) => ({ slug: i.slug, updatedAt: i.updatedAt }));
}
