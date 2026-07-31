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

import { findPolicyFallback } from "./legal/policy-content";

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
