/**
 * 결제수단 단일 상수 (Single Source of Truth)
 *
 * [생성 2026-05-18] 흩어진 결제수단 정의 3곳(DTO @IsEnum, kg-inicis kgPaymethodMap,
 *   frontend messages.paymentMethodMap)을 한 곳으로 통합. 새 결제수단 추가 시
 *   이 파일을 단일 진입점으로 갱신한다.
 *
 * ⚠️ 외부 PG 스펙 종속 — 공통코드(CommonCode) 테이블이나 DB enum 으로 빼면 안 된다.
 *   각 키는 KG이니시스 SDK 의 paymethod 파라미터(Card/VBank/DirectBank/HPP) 또는
 *   토스페이먼츠 위젯 라우팅과 1:1 매핑되어 있으며, 운영자가 자율 변경 시 결제 사고
 *   위험. 신규 결제수단 추가에는 다음이 모두 필요:
 *     A. 이 상수 갱신          (개발자)
 *     B. PG 가맹점 계약 + API 키 발급  (사업/법무)
 *     C. payments 모듈 라우팅 분기 추가 (개발자)
 *     D. 보안 검토 + 정산 연동  (개발자/QA)
 *
 * Frontend 동기화:
 *   teamplus-web/src/lib/messages.ts 의 MESSAGES.payment2.paymentMethodMap 은
 *   본 상수의 label 만 미러링한다. 라벨 변경 시 두 곳 동시 갱신 의무.
 *   (모노레포 @shared/ alias 통합은 별도 작업으로 검토)
 */

/** 결제수단 메타 정보 */
export interface PaymentMethodMeta {
  /** 사용자 노출 한글 라벨 */
  label: string;
  /** KG이니시스 공식 paymethod 파라미터 값 (null = KG 미사용, 예: toss) */
  kgPaymethod: string | null;
  /** 머터리얼 아이콘 이름 (Icon name) */
  icon: string;
}

/**
 * 결제수단 정의 — 단일 진실
 *
 *  key (예: "card") — 내부 식별자. DTO @IsEnum / DB payment_method 컬럼 / URL 파라미터
 *                     모두 이 키 사용.
 *  KG이니시스: card·easy·vbank·trans·phone
 *  토스페이먼츠: toss (Web SDK 위젯 위임)
 */
export const PAYMENT_METHODS = {
  card: {
    label: "신용카드",
    kgPaymethod: "Card",
    icon: "credit_card",
  },
  easy: {
    label: "간편결제",
    kgPaymethod: "Card", // 간편결제는 KG에서 Card 기반으로 동작 (acceptmethod 로 세부 분기 향후 확장)
    icon: "credit_card",
  },
  vbank: {
    label: "가상계좌",
    kgPaymethod: "VBank",
    icon: "account_balance",
  },
  trans: {
    label: "계좌이체",
    kgPaymethod: "DirectBank",
    icon: "account_balance",
  },
  phone: {
    label: "휴대폰 결제",
    kgPaymethod: "HPP",
    icon: "phone_iphone",
  },
  toss: {
    label: "토스페이먼츠",
    kgPaymethod: null, // 토스는 KG 미사용 — 위젯 SDK 가 자체 처리
    icon: "credit_card",
  },
} as const satisfies Record<string, PaymentMethodMeta>;

/** 결제수단 코드 유니언 타입 */
export type PaymentMethodCode = keyof typeof PAYMENT_METHODS;

/** 결제수단 코드 배열 (DTO @IsEnum 인자용) */
export const PAYMENT_METHOD_CODES = Object.keys(
  PAYMENT_METHODS,
) as PaymentMethodCode[];

/**
 * 결제수단 코드 → KG이니시스 공식 paymethod 변환.
 *
 *  미정의 코드 또는 toss(KG 미사용) 인 경우 안전 fallback "Card" 반환.
 *  ⚠️ fallback 동작은 라우팅 사고 방지 목적 — 운영 시 미정의 코드가 도달하는 경우
 *     로그 경고 필요 (호출 측에서 처리).
 */
export function getKgPaymethod(code: string): string {
  const meta = PAYMENT_METHODS[code as PaymentMethodCode];
  return meta?.kgPaymethod ?? "Card";
}

/** 결제수단 코드 → 사용자 노출 한글 라벨 (백엔드 응답 빌더에서 사용) */
export function getPaymentMethodLabel(code: string): string {
  const meta = PAYMENT_METHODS[code as PaymentMethodCode];
  return meta?.label ?? code;
}
