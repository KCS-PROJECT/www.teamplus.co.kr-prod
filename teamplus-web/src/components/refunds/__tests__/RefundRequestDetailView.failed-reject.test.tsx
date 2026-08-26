/**
 * RefundRequestDetailView — 실행 실패(execution_failed) 상태의 거절 CTA 노출/제출(RTL).
 *
 * 검증: 이체 미발생이 확정된 PG 실패만 거절 CTA 노출(재처리와 병행) · 사유 제출 시 계약 호출 ·
 *       DB_AFTER_PG(이체 완료 후 DB 실패) · PG 미확정 코드는 거절 CTA 미노출.
 */

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { RefundRequestDetailView } from '@/components/refunds/RefundRequestDetailView';
import { MESSAGES } from '@/lib/messages';
import { getRefundRequestDetail, rejectRefundRequest } from '@/services/payment';

jest.mock('@/services/payment', () => {
  const actual = jest.requireActual('@/services/payment');
  return {
    ...actual,
    getRefundRequestDetail: jest.fn(),
    rejectRefundRequest: jest.fn(),
  };
});

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/ui/Modal/ModalContext', () => ({
  useModal: () => ({ modal: { confirm: jest.fn().mockResolvedValue(true) } }),
}));
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const getDetail = getRefundRequestDetail as jest.Mock;
const reject = rejectRefundRequest as jest.Mock;

/** 실행 실패 상세 — 기본은 PG 확정 거절(FORBIDDEN_REQUEST). */
function failedDetail(decision: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    status: 'execution_failed',
    sourceType: 'CLASS_PREPAID',
    subjectLabel: '테스트 수업',
    version: 2,
    scope: { sourceType: 'CLASS_PREPAID', teamId: 'team-1', academyId: null },
    payment: {
      orderNumber: 'O1',
      amount: 250000,
      paymentMethod: 'toss',
      tid: null,
      currentStatus: 'completed',
      completedAt: null,
      product: '이용권',
    },
    request: {
      requesterName: '김부모',
      requesterPhone: null,
      childName: null,
      requestReason: '사유',
      requestedAmount: 250000,
      createdAt: '2026-08-20T00:00:00Z',
    },
    usage: null,
    judgmentDataOk: true,
    snapshotVsCurrent: {
      requestedStatusAtCreate: 'completed',
      requestedAmount: 250000,
      currentPaymentStatus: 'completed',
    },
    decision: {
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionReason: null,
      failureStage: 'PG',
      failureCode: 'PG_CANCEL_ERROR',
      failureReason: '허용되지 않은 요청입니다. (FORBIDDEN_REQUEST)',
      ...decision,
    },
    history: [],
  };
}

function renderView() {
  return render(
    <RefundRequestDetailView requestId="req-1" scope="team" userType="director" onReady={jest.fn()} />,
  );
}

describe('RefundRequestDetailView 실행 실패 거절', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => cleanup());

  it('PG 확정 실패 — 거절 CTA 가 재처리와 함께 노출되고 사유 제출 시 계약 호출', async () => {
    getDetail
      .mockResolvedValueOnce({ success: true, data: failedDetail() })
      .mockResolvedValueOnce({
        success: true,
        data: { ...failedDetail(), status: 'rejected', version: 3 },
      });
    reject.mockResolvedValueOnce({
      success: true,
      data: { status: 'rejected', version: 3 },
    });

    renderView();
    const rejectCta = await screen.findByRole('button', {
      name: MESSAGES.refund.rejectCta,
    });
    expect(
      screen.getByRole('button', { name: MESSAGES.refund.reprocessCta }),
    ).toBeInTheDocument();

    fireEvent.click(rejectCta);
    fireEvent.change(
      screen.getByPlaceholderText(MESSAGES.refund.rejectReasonPlaceholder),
      { target: { value: 'PG 취소 불가 — 종결' } },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: MESSAGES.refund.rejectConfirm }),
      );
    });

    expect(reject).toHaveBeenCalledWith('req-1', {
      version: 2,
      decisionReason: 'PG 취소 불가 — 종결',
    });
  });

  it('DB_AFTER_PG(이체 완료 후 DB 실패) — 거절 CTA 미노출, 재처리만', async () => {
    getDetail.mockResolvedValue({
      success: true,
      data: failedDetail({
        failureStage: 'DB_AFTER_PG',
        failureCode: 'DB_TX_FAILED',
        failureReason: '원장 반영 실패',
      }),
    });

    renderView();
    expect(
      await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.rejectCta }),
    ).toBeNull();
  });

  it('PG 미확정(TOSS_UNCONFIRMED) — 거절 CTA 미노출', async () => {
    getDetail.mockResolvedValue({
      success: true,
      data: failedDetail({
        failureCode: 'TOSS_UNCONFIRMED',
        failureReason: 'PG 결과 미확정',
      }),
    });

    renderView();
    await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta });
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.rejectCta }),
    ).toBeNull();
    expect(reject).not.toHaveBeenCalled();
  });
});
