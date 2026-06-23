/**
 * 거래로그 캡처 입력 — ApiLifecycleInterceptor.finalize 가 단일 객체로 전달.
 * (인터셉터가 이미 보유한 값만 모아 넘기므로 추가 연산 없음)
 */
export interface TxCaptureInput {
  /** 업무 키값 (클라이언트 echo 또는 서버 randomUUID) — upsert where */
  requestId: string;
  /** 요청 수신 시각 (ctx.startAt 기반 Date) */
  occurredAt: Date;
  method: string;
  /** req.url (쿼리스트링 포함) — path 는 저장 시 pathname 으로 분리 */
  url: string;
  httpStatus: number;
  durationMs: number;
  /** envelope 래핑 완료된 응답 body (성공 시) */
  outputBody: unknown;
  /** 예외 객체 (에러 시) */
  outputError: unknown;
  reqHeaders: Record<string, unknown>;
  reqBody: unknown;
  reqQuery: unknown;
  reqParams: unknown;
  resHeaders: Record<string, unknown>;
  // ApiLifecycleContext 파생 메타
  platform?: string;
  clientVersion?: string;
  viewId?: string;
  ip?: string;
  userId?: string;
  userRole?: string;
  userEmail?: string;
  /** NODE_ENV */
  env: string;
}

export type TxResult = "SUCCESS" | "FAIL" | "ERROR";

export interface DecideResultOutput {
  result: TxResult;
  /** 응답 body.success 가 boolean 일 때만 그 값, 아니면 null */
  bizSuccess: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
}
