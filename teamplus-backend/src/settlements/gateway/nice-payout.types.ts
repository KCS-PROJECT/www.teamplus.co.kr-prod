export const NICE_PAYOUT_GATEWAY = Symbol("NICE_PAYOUT_GATEWAY");

/** 0101001 잔액조회 · 0105001 서브몰 등록/수정 · 0102001 지급요청 · 0103001 지급취소 · 0101002 지급결과조회 */
export type NicePayoutSid =
  | "0101001"
  | "0105001"
  | "0102001"
  | "0103001"
  | "0101002";

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
  requestPayout(req: NicePayoutRequestInput): Promise<NicePayoutRequestResult>;
  cancelPayout(req: NicePayoutCancelInput): Promise<NicePayoutCancelResult>;
  queryPayoutResults(
    req: NicePayoutResultsQuery,
  ): Promise<NicePayoutResultsResult>;
}

export interface NicePayoutRequestInput {
  subId: string;
  /** 지급일 YYYYMMDD(KST) */
  settlmntDt: string;
  /** 원 단위 양수 */
  settlmntAmt: number;
  /** Y 면 같은 서브몰·지급일·금액 요청을 나이스가 1103 으로 거절한다 */
  dupChkYn: "Y" | "N";
  /** 수취 통장 표기(30바이트) */
  accntDesc?: string;
}

export interface NicePayoutRequestResult {
  outcome: NicePayoutOutcome;
  meta: NicePayoutCallMeta;
  /** 나이스 접수번호 — 성공 응답에만 있다. 취소·결과 대조에 쓴다 */
  seq: string | null;
}

/** 지급 취소 — 단건, 지급일 당일 오전 10:30 전까지만 받는다. */
export interface NicePayoutCancelInput {
  subId: string;
  /** 지급일 YYYYMMDD(KST) */
  settlmntDt: string;
  /** 지급 요청 때 받은 접수번호 */
  seq: string;
}

export interface NicePayoutCancelResult {
  outcome: NicePayoutOutcome;
  meta: NicePayoutCallMeta;
}

export interface NicePayoutResultsQuery {
  /** 지급일 YYYYMMDD(KST) */
  settlmntDt: string;
  /** 생략 시 그 지급일 전체 */
  subId?: string;
}

/** 결과 조회 한 줄 — 계좌번호·사업자번호는 응답에 있어도 받지 않는다. */
export interface NicePayoutResultRow {
  seq: string | null;
  subId: string;
  /** 요청 / 성공 / 실패 / 재요청 진행중 / 삭제 (나이스 원문) */
  statusNm: string;
  settlmntAmt: number | null;
  errReason: string | null;
}

export interface NicePayoutResultsResult {
  outcome: NicePayoutOutcome;
  meta: NicePayoutCallMeta;
  totCnt: number | null;
  succCnt: number | null;
  failCnt: number | null;
  remainAmt: number | null;
  rows: NicePayoutResultRow[];
}
