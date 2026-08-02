/**
 * POST /api/blog-view — 블로그 실측 조회수 비콘 프록시
 *
 * 상세 페이지(BlogViewPing)가 실제 열람 시 호출하는 내부 엔드포인트.
 * 클라이언트 → /api/blog-view → backend `…/api/v1/blog/:slug/view` 로 프록시한다.
 *
 * 배경: 상세 페이지는 ISR(5분) 캐시라 서버 fetch 횟수 ≠ 실제 독자 수.
 *   조회수 집계는 이 비콘 → backend POST :slug/view 가 단일 경로다.
 * - slug 형식(^[a-z0-9-]{1,80}$) 검증 후 forward — 경로 주입 차단.
 * - 미존재 slug 는 backend 가 조용히 무시(updateMany). 실패해도 페이지 UX 무영향.
 *
 * 패턴 참고: src/app/api/contact/route.ts (backend forward 방식)
 */
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiBase, BLOG_CACHE_TAG } from "@/lib/blog-api";

export const runtime = "nodejs"; // backend fetch — Node.js runtime 명시
export const dynamic = "force-dynamic"; // ISR 캐시 차단

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export async function POST(req: NextRequest) {
  let slug = "";
  try {
    const body = (await req.json()) as { slug?: unknown };
    if (typeof body.slug === "string") slug = body.slug;
  } catch {
    // body 파싱 실패 → 아래 형식 검증에서 걸러짐
  }

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { success: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${apiBase()}/blog/${slug}/view`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ success: false }, { status: 502 });
    }
    // 조회수가 실제로 올랐으므로 블로그 캐시(목록·카테고리 탭·상세) 일괄 무효화 —
    // 다음 요청부터 모든 화면의 카운터가 일치한다. 트래픽 = 실제 열람 수(세션당
    // 글별 1회)라 무효화 빈도는 낮고, 재렌더는 다음 방문 1회로 한정된다.
    revalidateTag(BLOG_CACHE_TAG);
    return NextResponse.json({ success: true });
  } catch {
    // 백엔드 순단 — 조회수 비콘은 조용히 실패해도 무방
    return NextResponse.json({ success: false }, { status: 502 });
  }
}
