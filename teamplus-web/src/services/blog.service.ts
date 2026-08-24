/**
 * 포스트(BlogPost) 공개 소비 서비스 — web 단일 출처.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-1
 *
 * 공개 계약:
 *  - GET  /blog            목록 (pinned DESC, createdAt DESC — "최신순" 을 약속하지 않는다)
 *  - GET  /blog/:slug      상세 (PUBLISHED 만)
 *  - POST /blog/:slug/view 조회수 비콘 (fire-and-forget)
 *
 * 쿼리 파라미터는 page · pageSize · category 만 노출한다.
 * backend DTO 는 status/search 도 수용하지만 공개 서비스가 무시하므로 web facade 에서 노출하지 않는다.
 * /blog/admin/* 관리 경로는 이 서비스에서 절대 호출하지 않는다 (SYSTEM/OPER 전용).
 */

import { api } from './api-client';
import { devWarn } from '@/lib/logger';

// ─── Types ──────────────────────────────────────────

export type BlogCategory = 'NEWS' | 'GUIDE' | 'EVENT' | 'PRESS';

export interface BlogListItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: BlogCategory;
  coverImageUrl: string | null;
  status: 'PUBLISHED';
  pinned: boolean;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogDetail extends BlogListItem {
  /** 저장 시점에 백엔드 sanitizeBlogHtml 로 살균된 HTML — 렌더 전 DOMPurify 이중 방어 필수 */
  content: string;
  authorId: string | null;
}

export interface BlogListResult {
  items: BlogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Errors (화면이 404 와 일시 장애를 구분하기 위한 표준 오류) ───

/** 미발행·삭제·존재하지 않는 slug — 정상 404 상태로 렌더 */
export class BlogNotFoundError extends Error {
  constructor(slug: string) {
    super(`blog post not found: ${slug}`);
    this.name = 'BlogNotFoundError';
  }
}

/** 네트워크/5xx 등 일시 장애 — "다시 시도" 상태로 렌더 */
export class BlogRequestError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'BlogRequestError';
    this.statusCode = statusCode;
  }
}

// ─── API ────────────────────────────────────────────

export async function getBlogList(params: {
  page?: number;
  pageSize?: number;
  category?: BlogCategory;
} = {}): Promise<BlogListResult> {
  const query: Record<string, string | number> = {};
  if (params.page) query.page = params.page;
  if (params.pageSize) query.pageSize = params.pageSize;
  if (params.category) query.category = params.category;

  const response = await api.get<BlogListResult>('/blog', { params: query });
  if (!response.success || !response.data) {
    throw new BlogRequestError(
      response.error?.message ?? 'blog list request failed',
      response.error?.statusCode,
    );
  }
  return response.data;
}

export async function getBlogBySlug(slug: string): Promise<BlogDetail> {
  const response = await api.get<BlogDetail>(`/blog/${encodeURIComponent(slug)}`);
  if (!response.success || !response.data) {
    if (response.error?.statusCode === 404) {
      throw new BlogNotFoundError(slug);
    }
    throw new BlogRequestError(
      response.error?.message ?? 'blog detail request failed',
      response.error?.statusCode,
    );
  }
  return response.data;
}

/**
 * 조회수 비콘 — fire-and-forget. 실패해도 본문 열람을 막지 않으며 사용자 오류로 표시하지 않는다.
 * 세션당 1회 가드(sessionStorage `blog-viewed:${slug}`)는 호출 화면 책임.
 * 인증·개인정보·사용자 ID 를 추가하지 않는다.
 */
export async function recordBlogView(slug: string): Promise<void> {
  try {
    const response = await api.post(`/blog/${encodeURIComponent(slug)}/view`);
    if (!response.success) {
      devWarn('[blog.service] view beacon failed', { slug, error: response.error });
    }
  } catch (error) {
    devWarn('[blog.service] view beacon threw', { slug, error });
  }
}
