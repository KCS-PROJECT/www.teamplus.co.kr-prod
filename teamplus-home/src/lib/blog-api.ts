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

/**
 * 백엔드 장애(네트워크 단절 · 5xx · 파싱 실패) — "글 없음(404)" 과 반드시 구분한다.
 *
 * 구분하지 않으면 백엔드가 잠깐 흔들릴 때 살아있는 발행글이 404 로 응답되어
 * (a) 검색엔진이 실제 글을 색인에서 제거하고 (b) 목록은 ISR stale 캐시로 정상 렌더되는데
 * 상세만 "없는 글" 로 보여 원인 파악이 불가능해진다. (2026-07-16 실측 재현)
 */
export class BlogBackendError extends Error {
  constructor(url: string, detail: string, options?: { cause?: unknown }) {
    super(`블로그 백엔드 조회 실패 (${detail}): ${url}`, options);
    this.name = 'BlogBackendError';
  }
}

/**
 * 조회 결과 3-상태:
 *   { ok: true, data: T }    정상
 *   { ok: true, data: null } 백엔드가 404 로 확인해 준 "미존재"(미발행 DRAFT 포함)
 *   { ok: false, error }     백엔드 장애 — 호출부가 정책을 결정한다(상세=표면화 / 목록=graceful)
 */
type FetchOutcome<T> =
  | { ok: true; data: T | null }
  | { ok: false; error: BlogBackendError };

async function fetchJson<T>(url: string): Promise<FetchOutcome<T>> {
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  } catch (cause) {
    return { ok: false, error: new BlogBackendError(url, '연결 실패', { cause }) };
  }

  // 백엔드가 명시적으로 "없음" 이라고 답한 경우만 미존재로 취급한다.
  if (res.status === 404) return { ok: true, data: null };
  if (!res.ok) {
    return { ok: false, error: new BlogBackendError(url, `HTTP ${res.status}`) };
  }

  try {
    const body = (await res.json()) as { data?: T } & Record<string, unknown>;
    return { ok: true, data: (body?.data ?? (body as unknown as T)) ?? null };
  } catch (cause) {
    return { ok: false, error: new BlogBackendError(url, '응답 파싱 실패', { cause }) };
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

  const empty: BlogListResult = { items: [], total: 0, page, pageSize };
  const r = await fetchJson<BlogListResult>(`${apiBase()}/blog?${usp.toString()}`);
  // 목록은 랜딩 표면이라 장애 시에도 페이지 자체는 살린다(빈 목록 = "글이 없습니다").
  if (!r.ok) {
    console.error('[blog] 목록 조회 실패 — 빈 목록으로 응답합니다.', r.error.message);
    return empty;
  }
  return r.data ?? empty;
}

/**
 * 상세 조회. `null` 은 **백엔드가 404 로 확인해 준 미존재** 일 때만 반환한다(호출부에서 notFound()).
 * 백엔드 장애는 `BlogBackendError` 를 throw 해 error boundary(5xx)로 표면화한다 —
 * 살아있는 글을 404 로 오표기해 색인에서 지워지는 것을 막기 위함이다.
 */
export async function getBlogBySlug(slug: string): Promise<BlogDetail | null> {
  const r = await fetchJson<BlogDetail>(`${apiBase()}/blog/${encodeURIComponent(slug)}`);
  if (!r.ok) {
    console.error('[blog] 상세 조회 실패 — 404 대신 오류로 표면화합니다.', r.error.message);
    throw r.error;
  }
  return r.data;
}

/**
 * sitemap 용 — 발행글 slug + 갱신일(최대 100건).
 * 장애 시 throw 하면 sitemap 생성(및 빌드)이 깨지므로 빈 배열로 degrade 한다.
 */
export async function getPublishedBlogSlugs(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  const r = await fetchJson<BlogListResult>(`${apiBase()}/blog?pageSize=100`);
  if (!r.ok) {
    console.error('[blog] sitemap slug 조회 실패 — 블로그 항목을 생략합니다.', r.error.message);
    return [];
  }
  return (r.data?.items ?? []).map((i) => ({ slug: i.slug, updatedAt: i.updatedAt }));
}
