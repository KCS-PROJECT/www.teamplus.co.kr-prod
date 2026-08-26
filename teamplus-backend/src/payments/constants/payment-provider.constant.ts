import type { ConfigService } from "@nestjs/config";

/**
 * 결제사(PG) 카탈로그 — 관리자가 선택할 수 있는 결제사의 단일 진실.
 *
 * ⚠️ 결제수단(payment-method.constant.ts)과는 다른 축이다.
 *   결제수단 = 카드·계좌이체·간편결제 (사용자가 결제창에서 고름)
 *   결제사   = 토스페이먼츠·나이스페이먼츠 (관리자가 고름)
 *
 * KG이니시스는 여기에 없다 — 본인인증 전용이고 PG 결제 실사용이 0건이다.
 * Payment.pgProvider 컬럼에는 과거 기록값('mock' 등)이 들어갈 수 있으나
 * 이 카탈로그는 "지금 선택 가능한 결제사" 목록이라 서로 범위가 다르다.
 */
export interface PaymentProviderMeta {
  /** 관리자 화면 노출 라벨 */
  label: string;
  /** 프론트엔드 결제 화면이 이 결제사를 지원하는지 */
  checkoutImplemented: boolean;
  /** 결제에 필요한 환경변수 — 하나라도 비면 선택 불가 */
  requiredEnv: readonly string[];
}

export const PAYMENT_PROVIDERS = {
  toss: {
    label: "토스페이먼츠",
    checkoutImplemented: true,
    requiredEnv: ["TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"],
  },
  nice: {
    label: "나이스페이먼츠",
    checkoutImplemented: false,
    requiredEnv: ["NICE_CLIENT_KEY", "NICE_SECRET_KEY"],
  },
} as const satisfies Record<string, PaymentProviderMeta>;

export type PaymentProviderCode = keyof typeof PAYMENT_PROVIDERS;

export const PAYMENT_PROVIDER_CODES = Object.keys(
  PAYMENT_PROVIDERS,
) as PaymentProviderCode[];

/** 설정값이 없거나 알 수 없을 때의 결제사 — 현재 동작(토스)과 동일. */
export const DEFAULT_PAYMENT_PROVIDER: PaymentProviderCode = "toss";

export function isKnownPaymentProvider(
  value: unknown,
): value is PaymentProviderCode {
  return (
    typeof value === "string" &&
    (PAYMENT_PROVIDER_CODES as string[]).includes(value)
  );
}

export interface PaymentProviderStatus {
  code: PaymentProviderCode;
  label: string;
  /** 관리자가 실제로 선택할 수 있는지 — 화면 비활성화와 서버 저장 거부에 함께 쓴다. */
  selectable: boolean;
  /** 선택 불가 사유 (선택 가능하면 null) */
  reason: string | null;
}

/**
 * 결제사별 선택 가능 여부 판정.
 *
 * 화면에 비활성 항목을 하드코딩하지 않는 이유: 결제 화면을 구현하거나 키를 넣으면
 * 이 함수의 결과가 바뀌면서 관리자 화면이 자동으로 따라온다.
 */
export function describeProviders(
  config: ConfigService,
): PaymentProviderStatus[] {
  return PAYMENT_PROVIDER_CODES.map((code) => {
    const meta = PAYMENT_PROVIDERS[code];
    const missingEnv = meta.requiredEnv.filter(
      (key) => !config.get<string>(key),
    );
    const reasons: string[] = [];
    if (missingEnv.length > 0) reasons.push("키 미설정");
    if (!meta.checkoutImplemented) reasons.push("결제 화면 미구현");
    return {
      code,
      label: meta.label,
      selectable: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join(" · ") : null,
    };
  });
}

export function isProviderSelectable(
  code: string,
  config: ConfigService,
): boolean {
  return describeProviders(config).some(
    (p) => p.code === code && p.selectable,
  );
}
