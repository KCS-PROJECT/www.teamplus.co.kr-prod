/**
 * postpaid-billing.service.ts (Phase B-5-3)
 *
 * 후불(모드 A POSTPAID) 정산 — 감독 검수용 초안 조회 + 확정(결제 요청).
 * 백엔드:
 *   GET  /api/v1/payments/postpaid/draft?classId=&yearMonth=  (COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN)
 *   POST /api/v1/payments/postpaid/confirm                    (동일 RBAC)
 */
import { api } from "./api-client";

export interface PostpaidDraftItem {
  userId: string;
  name: string;
  attendanceCount: number;
  amount: number;
}

export interface PostpaidDraft {
  classId: string;
  yearMonth: string;
  /** 1회 수업료(회당 단가). 0 이면 후불 단가 미설정(=선불 수업) → 섹션 숨김 판단. */
  unitPrice: number;
  status: "none" | "draft" | "confirmed";
  confirmedAt: string | null;
  totalAmount: number;
  items: PostpaidDraftItem[];
}

export interface ConfirmPostpaidResult {
  billingId: string;
  lineCount: number;
  totalAmount: number;
}

export async function getPostpaidDraft(
  classId: string,
  yearMonth: string,
): Promise<PostpaidDraft | null> {
  const res = await api.get<PostpaidDraft>(
    `/payments/postpaid/draft?classId=${encodeURIComponent(classId)}&yearMonth=${encodeURIComponent(yearMonth)}`,
  );
  return res.success && res.data ? res.data : null;
}

export async function confirmPostpaidSettlement(
  classId: string,
  yearMonth: string,
): Promise<ConfirmPostpaidResult | null> {
  const res = await api.post<ConfirmPostpaidResult>(
    `/payments/postpaid/confirm`,
    { classId, yearMonth },
  );
  return res.success && res.data ? res.data : null;
}

// ────────────────────────────────────────────────────────────
// 결과형 API (금융 화면 계약 — 실패를 null 로 위장하지 않고 구별)
// ────────────────────────────────────────────────────────────

/** draft 조회 결과 — 실패(ok:false)와 정상-null 구분 불가 문제를 제거한 결과형. */
export type PostpaidDraftResult =
  | { ok: true; data: PostpaidDraft }
  | { ok: false };

/**
 * 후불 정산 초안 조회(결과형). 로드 실패를 명시적으로 구별한다.
 * 기존 `getPostpaidDraft`(null 위장)와 병존 — 신규 소비자는 이 함수를 사용한다.
 */
export async function fetchPostpaidDraft(
  classId: string,
  yearMonth: string,
): Promise<PostpaidDraftResult> {
  const res = await api.get<PostpaidDraft>(
    `/payments/postpaid/draft?classId=${encodeURIComponent(classId)}&yearMonth=${encodeURIComponent(yearMonth)}`,
  );
  return res.success && res.data ? { ok: true, data: res.data } : { ok: false };
}

/** 정산 확정 결과 — 실패 시 서버 메시지(권한/과거월/이미확정)를 노출용으로 전달. */
export type ConfirmPostpaidResultResponse =
  | { ok: true; data: ConfirmPostpaidResult }
  | { ok: false; error?: string };

/**
 * 후불 정산 확정(결과형). 실패 시 서버 에러 메시지를 담아 반환하여
 * 호출부가 일반 에러 대신 서버 문구(과거월/권한/이미확정)를 우선 노출할 수 있게 한다.
 */
export async function confirmPostpaidSettlementResult(
  classId: string,
  yearMonth: string,
): Promise<ConfirmPostpaidResultResponse> {
  const res = await api.post<ConfirmPostpaidResult>(
    `/payments/postpaid/confirm`,
    { classId, yearMonth },
  );
  return res.success && res.data
    ? { ok: true, data: res.data }
    : { ok: false, error: res.error?.message };
}
