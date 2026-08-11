/**
 * TEAMPLUS 약관 콘텐츠 — 회원가입 동의 모달 전용 어댑터
 *
 * [2026-07-30 통합] 이 파일은 더 이상 독립된 약관 본문을 보유하지 않습니다.
 *   본문 SoT 는 `lib/legal/policy-content.ts` 단일 파일이며, 이 파일은
 *   회원가입 동의 모달(`app/(auth)/signup/page.tsx`)이 사용하는 축약 키
 *   (service / privacy / marketing)를 표준 정책 type
 *   (terms_of_service / privacy_policy / marketing)으로 연결하는 어댑터입니다.
 *
 *   통합 배경(2026-07-30 법적 리스크 감사):
 *     이전에는 이 파일이 자체 본문을 갖고 있어, **회원이 가입 시 동의한 문서와
 *     나중에 `/terms` 에서 게시·열람하는 문서의 내용이 서로 달랐습니다**
 *     (특히 미사용 수업권 환불 조항이 "수수료 10% 공제" vs "환불 불가" 로 상충).
 *     약관규제법 §3(명시·설명의무)·PIPA §30① 위반 소지가 있어 단일 본문으로 통합했습니다.
 *
 * ⚠️ 유지 계약(깨뜨리지 말 것):
 *   - export 이름: TERMS_CONTENT · TERMS_IDS · TermsId · TermsData · getTermsContent
 *   - TERMS_CONTENT 의 키: "service" | "privacy" | "marketing"
 *   - TermsData 필드: title · version · updatedAt · required · content
 *   signup/page.tsx 는 위 계약만 사용하므로 import 경로 변경이 필요하지 않습니다.
 */

import { findPolicyFallback, normalizePolicyType } from "./legal/policy-content";

export interface TermsData {
  title: string;
  version: string;
  updatedAt: string;
  required: boolean;
  content: string;
}

/** 가입 동의 모달 키 → 표준 정책 type 매핑 */
const SIGNUP_TERMS_MAP: ReadonlyArray<{
  id: string;
  policyType: string;
  required: boolean;
}> = [
  { id: "service", policyType: "terms_of_service", required: true },
  { id: "privacy", policyType: "privacy_policy", required: true },
  { id: "marketing", policyType: "marketing", required: false },
];

function toTermsData(policyType: string, required: boolean): TermsData {
  const policy = findPolicyFallback(policyType);
  return {
    title: policy?.title ?? "약관",
    // 게시본과 동일한 버전·시행일을 노출해야 동의 이력의 근거가 일치한다.
    version: policy ? `v${policy.version}` : "v1.0",
    updatedAt: policy ? policy.updatedAt.replace(/-/g, ".") : "",
    required,
    content: policy?.content ?? "",
  };
}

export const TERMS_CONTENT: Record<string, TermsData> = SIGNUP_TERMS_MAP.reduce<
  Record<string, TermsData>
>((acc, entry) => {
  acc[entry.id] = toTermsData(entry.policyType, entry.required);
  return acc;
}, {});

/**
 * 약관 ID 목록 (순서 보장)
 *
 * (2026-06-14) 'third-party'(제3자 정보 제공 동의) 항목 제거 — 외부 처리를 모두
 *   '처리 위탁'으로 통일(개인정보 처리방침 제3조)하여 별도 제3자 제공 동의가 불필요해짐.
 */
export const TERMS_IDS = ["service", "privacy", "marketing"] as const;
export type TermsId = (typeof TERMS_IDS)[number];

/**
 * 약관 ID로 콘텐츠 가져오기
 */
export function getTermsContent(id: string): TermsData | undefined {
  return TERMS_CONTENT[id];
}

// ────────────────────────────────────────────────────────────
// DB 게시본 연동 (2026-08-10)
//
// 위 TERMS_CONTENT 는 **폴백**이다. 실제 게시본은 `GET /app/terms`(현행 1건/유형)가 SoT 이며,
// 가입 화면도 `/terms` 와 같은 소스를 읽어야 "가입 시 동의한 문서 = 게시된 문서" 가 유지된다.
// 조회 실패·미등록 유형은 폴백을 그대로 쓴다 — 가입 모달이 빈 화면이면 동의 자체가 무효가 된다.
// ────────────────────────────────────────────────────────────

/** `GET /app/terms` 응답 행 (필요한 필드만) */
export interface ApiTermsRow {
  type: string;
  title: string;
  content: string;
  version: string;
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * 절대시각(ISO) → 'YYYY.MM.DD' (**한국시간 고정**).
 * 로컬 getter 를 쓰면 시행일 `2026-07-29T15:00:00Z`(= KST 07-30)가 UTC 브라우저에서
 * 하루 앞당겨 보인다. +9h 시프트 후 UTC 파트를 읽어 고정한다.
 */
function toKstDateLabel(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.replace(/-/g, ".");
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 정책 1건을 DB 게시본에서 찾아 표시용 데이터로 변환한다.
 * 응답이 없거나 해당 유형이 미등록이면 코드 폴백을 반환한다.
 *
 * `policyType` 은 표준형(`terms_of_service` 등)·축약형(`service` 등) 모두 허용한다.
 */
export function resolveTermsDocument(
  rows: ApiTermsRow[] | null | undefined,
  policyType: string,
): TermsData | undefined {
  const normalized = normalizePolicyType(policyType);
  const row = rows?.find((r) => normalizePolicyType(r.type) === normalized);
  if (row) {
    return {
      title: row.title,
      version: `v${row.version}`,
      // 표시 기준은 "시행일" — DB 행은 publishedAt, 값이 없으면 updatedAt 으로 폴백.
      updatedAt: toKstDateLabel(row.publishedAt ?? row.updatedAt),
      required: SIGNUP_TERMS_MAP.some(
        (e) => e.policyType === normalized && e.required,
      ),
      content: row.content,
    };
  }

  const fallback = findPolicyFallback(normalized);
  if (!fallback) return undefined;
  return {
    title: fallback.title,
    version: `v${fallback.version}`,
    updatedAt: toKstDateLabel(fallback.updatedAt),
    required: SIGNUP_TERMS_MAP.some(
      (e) => e.policyType === normalized && e.required,
    ),
    content: fallback.content,
  };
}
