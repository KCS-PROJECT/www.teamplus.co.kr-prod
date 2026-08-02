import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, Eye, Pin } from 'lucide-react';
import { BlogViewPing } from '@/components/blog/BlogViewPing';
import { FinalCta } from '@/components/sections/FinalCta';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  getBlogBySlug,
  getBlogList,
  BLOG_CATEGORY_META,
  type BlogListItem,
} from '@/lib/blog-api';
import { blogPostingSchema, breadcrumbSchema } from '@/lib/seo';
import { cn } from '@/lib/utils';

// 발행 글을 재배포 없이 반영 — ISR(5분).
export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;

  // generateMetadata 는 error boundary(error.tsx) 밖에서 실행된다 — 여기서 백엔드 장애가
  // throw 되면 boundary 가 잡지 못해 원시 오류 화면이 뜬다. 메타데이터는 부가 정보이므로
  // 장애 시 비워 두고, 오류 표면화는 아래 페이지 렌더의 getBlogBySlug 에 맡긴다.
  let post: Awaited<ReturnType<typeof getBlogBySlug>> = null;
  try {
    post = await getBlogBySlug(slug);
  } catch {
    return {};
  }

  if (!post) return { title: '찾을 수 없음' };
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.summary,
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
  };
}

/** 한국어 기준 대략적 읽기 시간(분) — 분당 약 500자. */
function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500));
}

/**
 * 본문 h2 에서 목차를 추출하고 앵커 id(sec-N)를 주입 — 좌측 레일 목차용.
 * 저장된 HTML(살균 완료)은 불변이며 렌더 시점에만 가공한다. id 는 인덱스 기반이라
 * 한글 제목 인코딩 이슈가 없고, 주입 문자열에 사용자 입력이 섞이지 않는다.
 */
function extractToc(html: string): {
  toc: Array<{ id: string; label: string }>;
  content: string;
} {
  const toc: Array<{ id: string; label: string }> = [];
  let n = 0;
  const content = html.replace(
    /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g,
    (match, attrs: string | undefined, inner: string) => {
      const label = inner.replace(/<[^>]*>/g, '').trim();
      if (!label) return match;
      n += 1;
      const id = `sec-${n}`;
      toc.push({ id, label });
      return `<h2 id="${id}"${attrs ?? ''}>${inner}</h2>`;
    },
  );
  return { toc, content };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 관련 글 카드(컴팩트). */
function RelatedCard({ post }: { post: BlogListItem }) {
  const meta = BLOG_CATEGORY_META[post.category];
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-wline bg-wsurface transition-colors hover:border-ice-100 hover:bg-ice-50/30"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-wbg">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-wtext-4">
            TEAMPLUS+
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span
          className={cn(
            'mb-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
            meta.chip,
          )}
        >
          {meta.label}
        </span>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-rink-900 transition-colors group-hover:text-ice-600">
          {post.title}
        </h3>
      </div>
    </Link>
  );
}

export default async function BlogDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getBlogBySlug(slug);
  if (!post) notFound();

  const meta = BLOG_CATEGORY_META[post.category];
  const minutes = readingMinutes(post.content);
  const { toc, content: bodyHtml } = extractToc(post.content);

  // 관련 글 — 최신 발행 글에서 현재 글 제외 후 최대 3개.
  const { items } = await getBlogList({ pageSize: 4 });
  const related = items.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      {/* 실측 조회수 비콘 — 실제 열람 시 1회 POST (세션당 글별 1회) */}
      <BlogViewPing slug={post.slug} />
      <JsonLd
        data={[
          blogPostingSchema(post),
          breadcrumbSchema([
            { name: '홈', path: '/' },
            { name: '블로그', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />

      {/* 아티클 헤더 — 좁은 컬럼 중앙, 에디토리얼 톤 */}
      <header className="relative isolate pt-36 sm:pt-44">
        <div className="container-site">
          <div className="mx-auto flex max-w-5xl justify-center gap-10 xl:gap-14">
            {/* 좌측 레일과 동일 폭 스페이서 — 제목·본문 시작선을 정렬 */}
            <div aria-hidden="true" className="hidden w-60 shrink-0 lg:block" />
            <div className="w-full min-w-0 max-w-3xl">
            {/* breadcrumb */}
            <nav className="flex items-center gap-1.5 text-xs text-wtext-4" aria-label="breadcrumb">
              <Link href="/blog" className="transition-colors hover:text-ice-600">
                블로그
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-wtext-3">{meta.label}</span>
            </nav>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {post.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ice-50 px-2 py-0.5 text-[10px] font-bold text-ice-700 ring-1 ring-ice-100">
                  <Pin size={10} /> 고정
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1',
                  meta.chip,
                )}
              >
                {meta.label}
              </span>
            </div>

            <h1 className="mt-4 text-balance text-3xl font-black leading-tight tracking-tight text-rink-900 sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-wtext-3 sm:text-lg">{post.summary}</p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-wline pt-5 text-sm text-wtext-4">
              <span className="font-medium text-wtext-3">
                {formatDate(post.publishedAt ?? post.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} /> 약 {minutes}분
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye size={14} /> {post.viewCount.toLocaleString()}
              </span>
            </div>
            </div>
          </div>
        </div>
      </header>

      <article className="pb-8 pt-10">
        <div className="container-site">
          <div className="mx-auto flex max-w-5xl justify-center gap-10 xl:gap-14">
            {/* 좌측 레일 — 글 정보 · 목차 · 도입 CTA (데스크톱 전용, 본문과 함께 읽는 보조 내비게이션) */}
            <aside className="hidden w-60 shrink-0 lg:block" aria-label="글 정보와 목차">
              <div className="sticky top-28 space-y-4">
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-wtext-3 transition-colors hover:text-ice-600"
                >
                  <ArrowLeft size={15} /> 블로그 목록으로
                </Link>

                {/* 글 정보 */}
                <div className="rounded-2xl border border-wline bg-wsurface p-5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1',
                      meta.chip,
                    )}
                  >
                    {meta.label}
                  </span>
                  <dl className="mt-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="shrink-0 text-wtext-4">발행일</dt>
                      <dd className="font-medium text-wtext-2">
                        {formatDate(post.publishedAt ?? post.createdAt)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="shrink-0 text-wtext-4">읽는 시간</dt>
                      <dd className="font-medium text-wtext-2">약 {minutes}분</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="shrink-0 text-wtext-4">조회</dt>
                      <dd className="font-medium text-wtext-2">
                        {post.viewCount.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* 목차 — 소제목 2개 이상일 때만 */}
                {toc.length >= 2 && (
                  <nav
                    className="rounded-2xl border border-wline bg-wsurface p-5"
                    aria-label="목차"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-widest text-wtext-4">
                      목차
                    </p>
                    <ol className="mt-3 space-y-2.5">
                      {toc.map((t) => (
                        <li key={t.id}>
                          <a
                            href={`#${t.id}`}
                            className="group flex items-start gap-2 text-[13px] leading-snug text-wtext-3 transition-colors hover:text-ice-600"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ice-200 transition-colors group-hover:bg-ice-500"
                            />
                            {t.label}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                )}

                {/* 도입 상담 미니 CTA */}
                <div className="rounded-2xl bg-ice-50 p-5 ring-1 ring-ice-100">
                  <p className="text-sm font-bold text-rink-900">
                    클럽 도입을 고민 중이신가요?
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-wtext-3">
                    지금 운영 방식 그대로 말씀해 주시면 클럽 상황에 맞춰 안내드립니다.
                  </p>
                  <Link
                    href="/contact"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ice-600 transition-colors hover:text-ice-700"
                  >
                    도입 상담 신청하기 <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </aside>

            <div className="w-full min-w-0 max-w-3xl">
            {/* 커버 */}
            {post.coverImageUrl && (
              <div className="mb-10 overflow-hidden rounded-2xl border border-wline">
                {/* backend 업로드 이미지(외부 오리진) — next/image 대신 일반 img 사용 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            )}

            {/* 본문 — backend sanitizeBlogHtml 로 저장 시점에 살균된 신뢰 HTML */}
            <div
              className={cn(
                'prose prose-slate max-w-none',
                'prose-headings:text-rink-900 prose-headings:font-bold prose-headings:tracking-tight',
                'prose-h2:mt-12 prose-h2:scroll-mt-28 prose-h2:text-2xl prose-h3:mt-8 prose-h3:text-xl',
                'prose-p:text-[16px] prose-p:leading-[1.85] prose-p:text-wtext-2',
                'prose-li:text-wtext-2 prose-li:leading-[1.8] prose-strong:text-rink-900',
                'prose-a:font-medium prose-a:text-ice-600 prose-a:no-underline hover:prose-a:underline',
                'prose-blockquote:border-l-2 prose-blockquote:border-l-ice-500 prose-blockquote:bg-ice-50/40 prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-wtext-3',
                'prose-img:rounded-xl prose-img:border prose-img:border-wline',
                'prose-hr:border-wline',
              )}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />

            {/* 목록으로 */}
            <div className="mt-12 border-t border-wline pt-8">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-wtext-3 transition-colors hover:text-ice-600"
              >
                <ArrowLeft size={15} /> 블로그 목록으로
              </Link>
            </div>
            </div>
          </div>
        </div>
      </article>

      {/* 관련 글 */}
      {related.length > 0 && (
        <section className="section relative !pt-4">
          <div className="container-site">
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold text-rink-900">다른 글도 읽어보세요</h2>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-ice-600 transition-colors hover:text-ice-700"
                >
                  전체 보기 <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p) => (
                  <RelatedCard key={p.id} post={p} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <FinalCta />
    </>
  );
}
