import type { ConfigService } from "@nestjs/config";

/**
 * 나이스 지급대행 API 사용 단계 — 재배포 없이 어드민 설정으로 단계를 올린다.
 *   off      : API 미사용. 운영자가 나이스 관리자에서 서브몰 등록·이체 후 어드민에 표시한다.
 *   readonly : 잔액·결과 조회만. 나이스 쪽 데이터를 바꾸는 호출(서브몰 등록·지급 요청)은 하지 않는다.
 *   live     : 서브몰 자동 등록과 지급 요청까지.
 */
export const PAYOUT_API_MODES = ["off", "readonly", "live"] as const;
export type PayoutApiMode = (typeof PAYOUT_API_MODES)[number];
export const DEFAULT_PAYOUT_API_MODE: PayoutApiMode = "off";

const PAYOUT_API_MODE_LABELS: Record<PayoutApiMode, string> = {
  off: "사용 안 함(수동 운영)",
  readonly: "조회만",
  live: "사용(서브몰 등록·지급 요청)",
};

export function isKnownPayoutApiMode(value: unknown): value is PayoutApiMode {
  return (
    typeof value === "string" &&
    (PAYOUT_API_MODES as readonly string[]).includes(value)
  );
}

/** NICE_PAYOUT_GATEWAY 가 가짜 게이트웨이를 요청하는지 — 공백·대소문자를 무시한다. */
export function requestsFakePayoutGateway(config: ConfigService): boolean {
  return (
    (config.get<string>("NICE_PAYOUT_GATEWAY") ?? "").trim().toLowerCase() ===
    "fake"
  );
}

/**
 * 게이트웨이 선택 규칙 단일 출처 — nice-payout.provider 가 이 함수로 구현을 고른다.
 * 가짜 게이트웨이는 운영에서 절대 선택되지 않는다(가짜 성공으로 등록·지급 완료가 기록되면 안 된다).
 */
export function resolvePayoutGatewayKind(
  config: ConfigService,
): "nice" | "fake" {
  return requestsFakePayoutGateway(config) &&
    config.get<string>("NODE_ENV") !== "production"
    ? "fake"
    : "nice";
}

/** NicePayoutHttpGateway.isConfigured 와 같은 기준 — 앞뒤 공백을 지운 MID·Key 가 모두 있어야 한다. */
export function isPayoutGatewayConfigured(config: ConfigService): boolean {
  if (resolvePayoutGatewayKind(config) === "fake") return true;
  return Boolean(
    (config.get<string>("NICE_PAYOUT_MID") ?? "").trim() &&
    (config.get<string>("NICE_PAYOUT_MERCHANT_KEY") ?? "").trim(),
  );
}

export interface PayoutApiModeStatus {
  code: PayoutApiMode;
  label: string;
  selectable: boolean;
  reason: string | null;
}

/** 어드민 선택지 — 화면 비활성화와 서버 저장 거부에 함께 쓴다. off 는 항상 선택 가능(되돌리기 경로). */
export function describePayoutApiModes(
  config: ConfigService,
): PayoutApiModeStatus[] {
  const configured = isPayoutGatewayConfigured(config);
  return PAYOUT_API_MODES.map((code) => {
    const selectable = code === "off" || configured;
    return {
      code,
      label: PAYOUT_API_MODE_LABELS[code],
      selectable,
      reason: selectable ? null : "지급대행 키 미설정",
    };
  });
}
