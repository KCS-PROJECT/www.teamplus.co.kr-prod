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
