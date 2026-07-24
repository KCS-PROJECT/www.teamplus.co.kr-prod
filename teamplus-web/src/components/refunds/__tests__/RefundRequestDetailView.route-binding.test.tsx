/**
 * RefundRequestDetailView — route 귀속(detail-requestId binding) + caller-boundary 회귀(RTL).
 *
 * Critical(R14): req-2 초기 조회 실패 시 이전 req-1 detail 이 남아 req-2 화면에 렌더되고, 액션이
 * currentRequestIdRef(req-2)를 캡처하면 가드가 통과해 이전 환불(req-1)에 금전 액션이 실행될 수 있었다.
 * 구조 수정: page 의 key={requestId} 리마운트 + 상태의 requestId 귀속(render-time fail-closed) +
 * 액션이 실제 API 대상 detail.id 를 캡처. 아래는 그 회귀를 고정한다.
 *   A) req-1 성공 → req-2(리마운트) 조회 실패 → req-1 상세/CTA 미노출 · 액션 API 0회.
 *   B) req-2 조회 deferred 인 render→passive-effect 구간에도 이전 req-1 CTA 미노출.
 *   C) 액션 대상 detail.id ≠ 현재 route → API 미호출(재처리 모달 게이트) / 결과 억제(즉시호출 액션).
 *   D) 재처리 API in-flight 중 route 변경 → 이전 finally 가 새 화면 processing 을 바꾸지 않음.
 */

import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { RefundRequestDetailView } from '@/components/refunds/RefundRequestDetailView';
import { MESSAGES } from '@/lib/messages';
import {
  getRefundRequestDetail,
  approveRefundRequest,
  rejectRefundRequest,
  reprocessRefundRequest,
  reconcileRefundRequest,
} from '@/services/payment';

jest.mock('@/services/payment', () => {
  const actual = jest.requireActual('@/services/payment');
  return {
    ...actual,
    getRefundRequestDetail: jest.fn(),
    approveRefundRequest: jest.fn(),
    rejectRefundRequest: jest.fn(),
    reprocessRefundRequest: jest.fn(),
    reconcileRefundRequest: jest.fn(),
  };
});
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }));
const mockModalConfirm = jest.fn();
jest.mock('@/components/ui/Modal/ModalContext', () => ({
  useModal: () => ({ modal: { confirm: (...a: unknown[]) => mockModalConfirm(...a) } }),
}));
jest.mock('@/hooks/useNavigation', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const getDetail = getRefundRequestDetail as jest.Mock;
const approve = approveRefundRequest as jest.Mock;
const reject = rejectRefundRequest as jest.Mock;
const reprocess = reprocessRefundRequest as jest.Mock;
const reconcile = reconcileRefundRequest as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function base(id: string, label: string) {
  return {
    id,
    sourceType: 'CLASS_PREPAID',
    subjectLabel: label,
    version: 1,
    scope: { sourceType: 'CLASS_PREPAID', teamId: 'team-1', academyId: null },
    payment: { orderNumber: 'O', amount: 10000, paymentMethod: 'card', tid: null, currentStatus: 'refunded', completedAt: null, product: '이용권' },
    request: { requesterName: '김부모', requesterPhone: null, childName: null, requestReason: '사유', requestedAmount: 10000, createdAt: '2026-07-23T00:00:00Z' },
    usage: null,
    judgmentDataOk: true,
    snapshotVsCurrent: { requestedStatusAtCreate: 'completed', requestedAmount: 10000, currentPaymentStatus: 'refunded' },
    history: [],
  };
}
/** KG 미확정 — ADMIN reconcile CTA. */
function kg(id: string, label: string) {
  return { ...base(id, label), status: 'execution_failed', decision: { decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null, failureStage: 'PG', failureCode: 'KG_UNCONFIRMED', failureReason: 'PG 미확정' } };
}
/** 재처리 가능 — execution_failed + 일반 실패. */
function failed(id: string, label: string) {
  return { ...base(id, label), status: 'execution_failed', decision: { decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null, failureStage: 'PG', failureCode: null, failureReason: 'PG 실패' } };
}

/** key={rid} 리마운트를 재현하는 래퍼. */
function KeyedView({ rid }: { rid: string }) {
  return (
    <RefundRequestDetailView key={rid} requestId={rid} scope="team" userType="admin" onReady={jest.fn()} />
  );
}

describe('RefundRequestDetailView route 귀속 · caller-boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModalConfirm.mockReset().mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it('A) req-2 리마운트 조회 실패 → req-1 상세/CTA 미노출 · 액션 API 0회', async () => {
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') }) // req-1 (reconcile CTA)
      .mockResolvedValueOnce({ success: false, error: { statusCode: 500, message: '조회 실패' } }); // req-2 실패

    const { rerender } = render(<KeyedView rid="req-1" />);
    expect(await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta })).toBeInTheDocument();

    // key 변경 → 리마운트, req-2 조회 실패.
    await act(async () => {
      rerender(<KeyedView rid="req-2" />);
    });

    // 이전 req-1 상세·CTA 미노출(오류 화면), 모든 액션 API·모달 0회.
    expect(screen.queryByText('REQ1 상세')).toBeNull();
    expect(screen.queryByRole('button', { name: MESSAGES.refund.reconcileCta })).toBeNull();
    expect(screen.queryByRole('button', { name: MESSAGES.refund.approveCta })).toBeNull();
    expect(reconcile).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(reprocess).not.toHaveBeenCalled();
    expect(mockModalConfirm).not.toHaveBeenCalled();
  });

  it('B) req-2 조회 deferred(render→effect 구간)에도 req-1 CTA 미노출', async () => {
    const req2 = deferred<unknown>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') })
      .mockReturnValueOnce(req2.promise);

    // 컴포넌트 내부 render-time 귀속 방어 검증(same-instance prop 변경).
    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    expect(await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta })).toBeInTheDocument();

    await act(async () => {
      rerender(<RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />);
    });
    // req-2 조회 pending — 이전 req-1 상세/CTA 모두 미노출(fail-closed).
    expect(screen.queryByText('REQ1 상세')).toBeNull();
    expect(screen.queryByRole('button', { name: MESSAGES.refund.reconcileCta })).toBeNull();

    // req-2 완료 시 정상 표시.
    await act(async () => {
      req2.resolve({ success: true, data: kg('req-2', 'REQ2 상세') });
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();
  });

  it('C) 재처리 모달 대기 중 route 변경 → 대상 detail.id ≠ 현재 route → 재처리 API 미호출', async () => {
    const confirmDef = deferred<boolean>();
    mockModalConfirm.mockReturnValueOnce(confirmDef.promise);
    getDetail
      .mockResolvedValueOnce({ success: true, data: failed('req-1', 'REQ1 상세') }) // req-1 재처리 CTA
      .mockResolvedValueOnce({ success: true, data: kg('req-2', 'REQ2 상세') }); // req-2

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta }));
    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    expect(reprocess).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />);
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();

    // 뒤늦게 모달 확인(true) — 캡처한 대상 detail.id(req-1) ≠ 현재 route(req-2) → API 미호출.
    await act(async () => {
      confirmDef.resolve(true);
    });
    expect(reprocess).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('D) 재처리 API in-flight 중 route 변경 → 이전 finally 가 새 화면 processing 미변경', async () => {
    const rep = deferred<{ success: boolean; data: { status: string } }>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: failed('req-1', 'REQ1 상세') }) // req-1 재처리 CTA
      .mockResolvedValueOnce({ success: true, data: failed('req-2', 'REQ2 상세') }); // req-2 재처리 CTA
    reprocess.mockReturnValueOnce(rep.promise);

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    // req-1 재처리 클릭 → 모달 확인 → API in-flight(processing).
    const reBtn = await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta });
    await act(async () => {
      fireEvent.click(reBtn);
    });
    expect(reprocess).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: MESSAGES.refund.reprocessProcessing })).toBeDisabled();

    // req-2 로 전환 → req-2 재처리 CTA idle.
    await act(async () => {
      rerender(<RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />);
    });
    expect(await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MESSAGES.refund.reprocessCta })).not.toBeDisabled();

    // 뒤늦게 req-1 재처리 완료 — 이전 finally 가 req-2 processing/CTA 를 바꾸면 안 된다.
    await act(async () => {
      rep.resolve({ success: true, data: { status: 'executing' } });
    });
    expect(screen.getByRole('button', { name: MESSAGES.refund.reprocessCta })).not.toBeDisabled();
    expect(reprocess).toHaveBeenCalledTimes(1);
  });
});
