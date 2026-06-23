/**
 * POST /api/contact — 도입 문의(상담 신청) 프록시 Route Handler
 *
 * teamplus-home 랜딩 폼(ContactForm)이 호출하는 내부 엔드포인트.
 * 클라이언트 → /api/contact → backend `…/api/v1/contact-inquiries` 로 프록시한다.
 *
 * - 카드/민감정보 없음(해당 도메인 아님). 단순 문의 텍스트만 전달.
 * - 필수 필드 present + privacyAgreed===true 1차 검증 후 forward.
 * - backend 응답을 정규화({ success, ... })하여 반환. 5xx/네트워크 실패 시 502 + 한글 메시지.
 *
 * 패턴 참고: src/app/api/log/route.ts (backend forward 정규화 방식)
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // backend fetch — Node.js runtime 명시
export const dynamic = "force-dynamic"; // ISR 캐시 차단

/** ContactForm 이 전송하는 body (백엔드 CreateContactInquiryDto 와 1:1) */
interface ContactInquiryBody {
  organizationName?: string;
  managerName?: string;
  email?: string;
  phone?: string;
  interestedPlan?: string;
  clubSize?: string;
  message?: string;
  privacyAgreed?: boolean;
}

/**
 * backend 타깃 URL 해석.
 * base 가 `/api/v1` 포함/미포함, trailing slash 유무 모두 안전하게 정규화하여
 * 최종 타깃을 `…/api/v1/contact-inquiries` 로 고정한다.
 */
function resolveTargetUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.BACKEND_URL ??
    "http://localhost:5003/api/v1";
  const base = raw.replace(/\/+$/, ""); // trailing slash 제거
  return base.endsWith("/api/v1")
    ? `${base}/contact-inquiries`
    : `${base}/api/v1/contact-inquiries`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) body 파싱
  let body: ContactInquiryBody;
  try {
    body = (await req.json()) as ContactInquiryBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_BODY",
        message: "요청 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }

  // 2) 필수 필드 검증 (프록시 1차 방어선 — backend DTO 가 최종 검증)
  const organizationName = body.organizationName?.trim();
  const managerName = body.managerName?.trim();
  const email = body.email?.trim();
  const phone = body.phone?.trim();

  if (!organizationName || !managerName || !email || !phone) {
    return NextResponse.json(
      {
        success: false,
        error: "MISSING_FIELDS",
        message: "필수 입력 항목을 모두 작성해주세요.",
      },
      { status: 400 },
    );
  }
  if (body.privacyAgreed !== true) {
    return NextResponse.json(
      {
        success: false,
        error: "PRIVACY_REQUIRED",
        message: "개인정보 수집·이용에 동의해주세요.",
      },
      { status: 400 },
    );
  }

  // 3) 정규화된 payload 구성 (불필요한 필드 forward 방지)
  const payload = {
    organizationName,
    managerName,
    email,
    phone,
    interestedPlan: body.interestedPlan,
    clubSize: body.clubSize,
    message: body.message?.trim() || undefined,
    privacyAgreed: true,
  };

  // 4) backend 프록시
  try {
    const res = await fetch(resolveTargetUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s — 무한 대기 방지
    });

    const env = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    // backend 전역 ResponseEnvelopeInterceptor 가 성공 응답을
    //   { success, requestId, data:{ success, id, createdAt } } 로 한 겹 더 래핑한다.
    //   → data 한 겹 해제. 추후 @SkipEnvelope 등으로 평문이 와도 안전하도록 fallback.
    const inner: Record<string, unknown> =
      env && typeof env.data === "object" && env.data !== null
        ? (env.data as Record<string, unknown>)
        : env ?? {};

    if (!res.ok) {
      // 4xx(검증 실패 등)는 backend status 전달, 5xx 는 502 로 정규화.
      //   에러 envelope 는 success:false 라 data 미래핑일 수 있어 env.message 도 fallback.
      const status = res.status >= 500 ? 502 : res.status;
      return NextResponse.json(
        {
          success: false,
          error: "BACKEND_ERROR",
          message:
            (inner?.message as string | undefined) ??
            (env?.message as string | undefined) ??
            "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: (inner?.id as string | undefined) ?? null,
        createdAt: (inner?.createdAt as string | undefined) ?? null,
      },
      { status: 201 },
    );
  } catch {
    // 네트워크 단절 · 타임아웃 등
    return NextResponse.json(
      {
        success: false,
        error: "NETWORK_ERROR",
        message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 502 },
    );
  }
}
