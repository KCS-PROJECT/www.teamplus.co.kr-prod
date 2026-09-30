export const NICE_PAYOUT_GATEWAY = Symbol("NICE_PAYOUT_GATEWAY");

export type NicePayoutSid = "0101001" | "0105001";

/** SUCCESS=0000 · TERMINAL=확정 실패(업무 오류) · AMBIGUOUS=결과 불명(무응답·통신·나이스 내부 오류) · CONFIG=우리 설정/구현 결함 */
export type NicePayoutOutcome = "SUCCESS" | "TERMINAL" | "AMBIGUOUS" | "CONFIG";

export interface NicePayoutCallMeta {
  sid: NicePayoutSid;
  /** 응답이 없으면 null */
  resCode: string | null;
  resMsg: string | null;
  httpStatus: number | null;
  durationMs: number;
  /** "timeout" | "network" | "invalid_response" | "not_configured" 등 (민감정보 없음) */
  error: string | null;
}

export interface NiceBalanceResult {
  outcome: NicePayoutOutcome;
  meta: NicePayoutCallMeta;
  remainAmt: number | null;
}

export interface NiceSubMallRequest {
  subId: string;
  subNm: string;
  /** 숫자 10자리 */
  subCoNo: string;
  bankCd: string;
  accntNo: string;
  accntNm: string;
  reqType: 0 | 1;
}

export interface NiceSubMallResult {
  outcome: NicePayoutOutcome;
  meta: NicePayoutCallMeta;
}

export interface NicePayoutGateway {
  /** readonly/live 모드 선택 가능 여부 — 필요한 env 가 모두 있는지 */
  isConfigured(): boolean;
  /** "nice" | "fake" */
  readonly kind: "nice" | "fake";
  getBalance(): Promise<NiceBalanceResult>;
  upsertSubMall(req: NiceSubMallRequest): Promise<NiceSubMallResult>;
}
