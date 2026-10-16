import { MESSAGES } from '@/lib/messages';

export type PayoutApiMode = 'off' | 'readonly' | 'live';

export type PayoutRequestStatus =
  | 'REQUESTING'
  | 'REQUESTED'
  | 'UNCONFIRMED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'NOT_FOUND';

export type PayoutRequestOutcome = 'REQUESTED' | 'UNCONFIRMED' | 'REJECTED' | 'SKIPPED' | 'ERROR';

/** 정산 한 건의 나이스 지급 요청 1건. 목록은 최신 1건, 상세는 이력 전체로 내려온다. */
export interface PayoutRequestInfo {
  id: string;
  status: PayoutRequestStatus;
  statusLabel: string;
  settlementDate: string | null;
  amount: number;
  niceSeq: string | null;
  niceStatusNm: string | null;
  requestDetail: string | null;
  errReason: string | null;
  needsReview: boolean;
  /** needsReview 를 켠 이유(끈 뒤에도 이력으로 남는다) */
  reviewReason?: string | null;
  reviewReasonLabel?: string | null;
  /** 사유가 돈이 두 번 나갔을 수 있는 것인지 — 서버가 사유 목록으로 판정한다 */
  duplicateSuspected?: boolean;
  /** 운영자가 확인 완료한 시각·이름·메모 — 자동으로 꺼진 경우는 null */
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  reviewMemo?: string | null;
  needsAttention: boolean;
  /** 지급 처리 중 목록의 [지급 취소] 노출 기준 — 서버가 지급일 10:30 마감까지 계산한다(live 여부는 화면이 따로 본다) */
  cancelable?: boolean;
  checkCount: number;
  requestedAt: string | null;
  confirmedAt: string | null;
  lastCheckedAt: string | null;
  teamName: string | null;
}

export interface PayoutMeta {
  label: string;
  badge: string;
}

const AMBER = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
const BLUE = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
const GREEN = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
const RED = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
const SLATE = 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
const PURPLE = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';

const REQUEST_STATUS_META: Record<PayoutRequestStatus, PayoutMeta> = {
  REQUESTING: { label: MESSAGES.settlement.payoutRequestStatusRequesting, badge: PURPLE },
  REQUESTED: { label: MESSAGES.settlement.payoutRequestStatusRequested, badge: BLUE },
  UNCONFIRMED: { label: MESSAGES.settlement.payoutRequestStatusUnconfirmed, badge: AMBER },
  SUCCEEDED: { label: MESSAGES.settlement.payoutRequestStatusSucceeded, badge: GREEN },
  FAILED: { label: MESSAGES.settlement.payoutRequestStatusFailed, badge: RED },
  REJECTED: { label: MESSAGES.settlement.payoutRequestStatusRejected, badge: RED },
  CANCELLED: { label: MESSAGES.settlement.payoutRequestStatusCancelled, badge: SLATE },
  NOT_FOUND: { label: MESSAGES.settlement.payoutRequestStatusNotFound, badge: AMBER },
};

const OUTCOME_META: Record<PayoutRequestOutcome, PayoutMeta> = {
  REQUESTED: { label: MESSAGES.settlement.payoutOutcomeRequested, badge: GREEN },
  UNCONFIRMED: { label: MESSAGES.settlement.payoutOutcomeUnconfirmed, badge: AMBER },
  REJECTED: { label: MESSAGES.settlement.payoutOutcomeRejected, badge: RED },
  SKIPPED: { label: MESSAGES.settlement.payoutOutcomeSkipped, badge: SLATE },
  ERROR: { label: MESSAGES.settlement.payoutOutcomeError, badge: RED },
};

/** 서버가 보내는 라벨을 우선하되, 모르는 상태값이 와도 화면이 깨지지 않게 한다. */
export function getPayoutRequestStatusMeta(
  status: string,
  serverLabel?: string | null,
): PayoutMeta {
  const meta = REQUEST_STATUS_META[status as PayoutRequestStatus];
  if (!meta) return { label: serverLabel || status, badge: SLATE };
  return { label: serverLabel || meta.label, badge: meta.badge };
}

export function getPayoutOutcomeMeta(outcome: string): PayoutMeta {
  return OUTCOME_META[outcome as PayoutRequestOutcome] ?? { label: outcome, badge: SLATE };
}

/** 'YYYY-MM-DD' → 'N월 N일'. 형식이 다르면 null. */
export function formatPayoutMonthDay(date: string | null | undefined): string | null {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return MESSAGES.settlementDynamic.monthDay(Number(match[2]), Number(match[3]));
}

/**
 * 지급대행 API 로 넘어간 정산의 상태 라벨. 기본 상태 라벨 대신 쓸 문구가 있으면 돌려주고,
 * 없으면 null(호출 쪽이 기존 라벨을 그대로 쓴다).
 */
export function getPayoutStatusLabelOverride(
  status: string,
  payoutScheduledDate: string | null | undefined,
): string | null {
  if (status === 'processing') {
    const dateLabel = formatPayoutMonthDay(payoutScheduledDate);
    return dateLabel
      ? MESSAGES.settlementDynamic.payoutProcessingScheduled(dateLabel)
      : MESSAGES.settlement.statusProcessingPayout;
  }
  if (status === 'failed') return MESSAGES.settlement.statusFailedPayout;
  return null;
}

/** 운영자용 사유 한 덩어리(행 hover·툴팁용). */
export function joinPayoutReasons(request: PayoutRequestInfo | null | undefined): string {
  if (!request) return '';
  return [request.statusLabel, request.errReason, request.requestDetail]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/**
 * 월 정산 탭의 단계 — 정산 상태 하나와 같다(같은 정산이 두 단계에 나오지 않는다). 한 단계에는 일괄 작업이 하나뿐이다.
 *   승인 대기(pending) → 승인 · 지급 대기(approved)·지급 실패(failed) → 지급 요청 · 그 외 → 조회만.
 *   확인 필요는 상태가 아니라 표시라 단계가 아니다 — 탭의 빨간 숫자와 [확인 필요만 보기]로 다룬다.
 */
export type SettlementStage =
  | 'all'
  | 'pending'
  | 'approved'
  | 'processing'
  | 'failed'
  | 'paid'
  | 'rejected';
export type StageAction = 'approve' | 'payout';

export function getStageAction(stage: SettlementStage): StageAction | null {
  if (stage === 'pending') return 'approve';
  if (stage === 'approved' || stage === 'failed') return 'payout';
  return null;
}

export interface SelectableSettlementRow {
  status: string;
  netAmount: number;
}

/**
 * 승인 대기 단계에서 이 행만 승인에서 빠지는 이유 — 없으면 null.
 * 지급 요청 단계는 요청할 수 없는 행을 "요청 불가" 구분으로 따로 모으므로(서버의 payoutBlock) 여기서 다루지 않는다.
 */
export function getRowExclusion(row: SelectableSettlementRow, action: StageAction): string | null {
  if (action === 'approve') {
    return row.netAmount < 0 ? MESSAGES.settlement.rowExcludedNegative : null;
  }
  return null;
}

/** 지급 대기·지급 실패 단계 안의 구분 — 지금 나이스에 요청할 수 있는 정산과 없는 정산. */
export type PayoutView = 'ready' | 'blocked';

/** 요청 불가 행에서 갈 곳 — 계좌는 지급 계좌 탭, 확인 필요는 정산 상세 팝업. */
export type PayoutBlockAction = 'account' | 'detail' | null;

const PAYOUT_BLOCK_META: Record<string, { label: string; action: PayoutBlockAction }> = {
  ACCOUNT_NONE: { label: MESSAGES.settlement.payoutBlockAccountNone, action: 'account' },
  NOT_REGISTERED: { label: MESSAGES.settlement.payoutBlockNotRegistered, action: 'account' },
  IN_PROGRESS: { label: MESSAGES.settlement.payoutBlockInProgress, action: 'account' },
  ACCOUNT_CHANGED: { label: MESSAGES.settlement.payoutBlockAccountChanged, action: 'account' },
  SUB_ID_MISSING: { label: MESSAGES.settlement.payoutBlockSubIdMissing, action: 'account' },
  PAYOUT_REVIEW_OPEN: { label: MESSAGES.settlement.payoutBlockReviewOpen, action: 'detail' },
  PAYOUT_REVIEW_REOPENED: { label: MESSAGES.settlement.payoutBlockReviewReopened, action: 'detail' },
  NET_NOT_POSITIVE: { label: MESSAGES.settlement.payoutBlockNetNotPositive, action: null },
};

/** 서버가 내려준 요청 불가 사유 코드의 짧은 표시와 갈 곳 — 모르는 코드는 상세로 보낸다. */
export function getPayoutBlockMeta(reason: string): { label: string; action: PayoutBlockAction } {
  return PAYOUT_BLOCK_META[reason] ?? { label: MESSAGES.settlement.payoutBlockOther, action: 'detail' };
}
