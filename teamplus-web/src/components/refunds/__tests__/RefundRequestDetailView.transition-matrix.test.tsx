/**
 * RefundRequestDetailView — req-1→req-2 전환 조합 매트릭스(RTL).
 *
 * 축: {req-1 상태: fetch-inflight / action-inflight / 완료} × {req-2 초기 조회: success / failure / deferred}
 * 공통 단언: 이전(req-1) 상세/CTA 미노출 · 이전 부수효과(toast/sheet/loading) 무영향 · API 오호출 0.
 *
 * 커버 매핑(중복 작성 금지 — 기존 커버 칸은 표기만, 빈 칸만 본 파일에서 신규):
 * ┌──────────────┬───────────────┬───────────────┬───────────────┐
 * │ req-1 \ req-2│ success       │ failure       │ deferred      │
 * ├──────────────┼───────────────┼───────────────┼───────────────┤
 * │ fetch-inflight│ generation ① │ ★ R1×C2 신규  │ generation ⑤⑥ │
 * │ action-inflight│ generation ②③④ / route-binding C·D │ ★ R2×C2 신규 │ ★ R2×C3 신규 │
 * │ 완료         │ ★ R3×C1 신규  │ route-binding A│ route-binding B│
 * └──────────────┴───────────────┴───────────────┴───────────────┘
 */

import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { RefundRequestDetailView } from '@/components/refunds/RefundRequestDetailView';
import { MESSAGES } from '@/lib/messages';
import { getRefundRequestDetail, reconcileRefundRequest, reprocessRefundRequest, approveRefundRequest } from '@/services/payment';

jest.mock('@/services/payment', () => {
  const actual = jest.requireActual('@/services/payment');
  return {
    ...actual,
    getRefundRequestDetail: jest.fn(),
    reconcileRefundRequest: jest.fn(),
    reprocessRefundRequest: jest.fn(),
    approveRefundRequest: jest.fn(),
  };
});
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/ui/Modal/ModalContext', () => ({
  useModal: () => ({ modal: { confirm: jest.fn().mockResolvedValue(true) } }),
}));
jest.mock('@/hooks/useNavigation', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const getDetail = getRefundRequestDetail as jest.Mock;
const reconcile = reconcileRefundRequest as jest.Mock;
const reprocess = reprocessRefundRequest as jest.Mock;
const approve = approveRefundRequest as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function base(id: string, label: string) {
  return {
    id, sourceType: 'CLASS_PREPAID', subjectLabel: label, version: 1,
    scope: { sourceType: 'CLASS_PREPAID', teamId: 'team-1', academyId: null },
    payment: { orderNumber: 'O', amount: 10000, paymentMethod: 'card', tid: null, currentStatus: 'refunded', completedAt: null, product: '이용권' },
    request: { requesterName: '김부모', requesterPhone: null, childName: null, requestReason: '사유', requestedAmount: 10000, createdAt: '2026-07-23T00:00:00Z' },
    usage: null, judgmentDataOk: true,
    snapshotVsCurrent: { requestedStatusAtCreate: 'completed', requestedAmount: 10000, currentPaymentStatus: 'refunded' },
    history: [],
  };
}
/** KG 미확정 — ADMIN reconcile CTA. */
function kg(id: string, label: string) {
  return { ...base(id, label), status: 'execution_failed', decision: { decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null, failureStage: 'PG', failureCode: 'KG_UNCONFIRMED', failureReason: 'PG 미확정' } };
}

function view(rid: string) {
  return <RefundRequestDetailView requestId={rid} scope="team" userType="admin" onReady={jest.fn()} />;
}
/** 이전 req-1 흔적이 전혀 없어야 함(공통). */
function expectNoReq1Leak() {
  expect(screen.queryByText('REQ1 상세')).toBeNull();
  expect(screen.queryByRole('button', { name: MESSAGES.refund.reconcileCta })).toBeNull();
  expect(toast.success).not.toHaveBeenCalled();
}

describe('RefundRequestDetailView 전환 조합 매트릭스(빈 칸)', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => cleanup());

  it('R1×C2) req-1 초기조회 in-flight → req-2 조회 실패 → req-1 미노출 · 늦은 req-1 무영향', async () => {
    const d1 = deferred<unknown>();
    getDetail
      .mockReturnValueOnce(d1.promise) // req-1 초기 deferred(로드 전)
      .mockResolvedValueOnce({ success: false, error: { statusCode: 500, message: '실패' } }); // req-2 실패

    const { rerender } = render(view('req-1'));
    // req-1 로딩 중 — 상세 없음.
    await act(async () => {
      rerender(view('req-2'));
    });
    // req-2 조회 실패 → 오류 화면.
    expect(await screen.findByText(MESSAGES.refund.detailLoadFailed)).toBeInTheDocument();
    // 늦은 req-1 완료 — req-2 화면(오류) 무영향.
    await act(async () => {
      d1.resolve({ success: true, data: kg('req-1', 'REQ1 상세') });
    });
    expect(screen.getByText(MESSAGES.refund.detailLoadFailed)).toBeInTheDocument();
    expectNoReq1Leak();
    expect(reconcile).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(reprocess).not.toHaveBeenCalled();
  });

  it('R2×C2) req-1 action in-flight → req-2 조회 실패 → 이전 action 무영향 · req-1 미노출', async () => {
    const rec = deferred<{ success: boolean; data: { status: string } }>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') })
      .mockResolvedValueOnce({ success: false, error: { statusCode: 500, message: '실패' } }); // req-2 실패
    reconcile.mockReturnValueOnce(rec.promise);

    const { rerender } = render(view('req-1'));
    // req-1 reconcile 제출(in-flight).
    fireEvent.click(await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }));
    fireEvent.change(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder), { target: { value: '메모' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
    });
    expect(reconcile).toHaveBeenCalledTimes(1);

    // req-2 전환 + 조회 실패 → 오류 화면.
    await act(async () => {
      rerender(view('req-2'));
    });
    expect(await screen.findByText(MESSAGES.refund.detailLoadFailed)).toBeInTheDocument();

    // 늦은 req-1 reconcile 완료 — 이전 action 이 req-2 화면을 바꾸면 안 됨.
    await act(async () => {
      rec.resolve({ success: true, data: { status: 'executed' } });
    });
    expect(screen.getByText(MESSAGES.refund.detailLoadFailed)).toBeInTheDocument();
    expectNoReq1Leak();
    expect(toast.error).not.toHaveBeenCalled(); // stale action toast 억제(오류화면은 렌더링일 뿐)
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('R2×C3) req-1 action in-flight → req-2 조회 deferred → 이전 action 무영향', async () => {
    const rec = deferred<{ success: boolean; data: { status: string } }>();
    const req2 = deferred<unknown>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') })
      .mockReturnValueOnce(req2.promise); // req-2 초기 deferred
    reconcile.mockReturnValueOnce(rec.promise);

    const { rerender } = render(view('req-1'));
    fireEvent.click(await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }));
    fireEvent.change(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder), { target: { value: '메모' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
    });
    expect(reconcile).toHaveBeenCalledTimes(1);

    // req-2 전환(조회 pending) → 로딩(null), req-1 미노출.
    await act(async () => {
      rerender(view('req-2'));
    });
    expectNoReq1Leak();

    // req-2 pending 중 늦은 req-1 reconcile 완료 — 무영향.
    await act(async () => {
      rec.resolve({ success: true, data: { status: 'executed' } });
    });
    expectNoReq1Leak();

    // req-2 조회 완료 → req-2 만 표시.
    await act(async () => {
      req2.resolve({ success: true, data: kg('req-2', 'REQ2 상세') });
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();
    expect(screen.queryByText('REQ1 상세')).toBeNull();
  });

  it('R3×C1) req-1 완료 → req-2 조회 성공 → req-2 만 표시 · 이전 흔적 무', async () => {
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') })
      .mockResolvedValueOnce({ success: true, data: kg('req-2', 'REQ2 상세') });

    const { rerender } = render(view('req-1'));
    expect(await screen.findByText('REQ1 상세')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.refund.reconcileCta })).toBeInTheDocument();

    await act(async () => {
      rerender(view('req-2'));
    });
    // req-2 정상 표시, req-1 미노출, 잔여 액션/토스트 없음.
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();
    expect(screen.queryByText('REQ1 상세')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });
});
