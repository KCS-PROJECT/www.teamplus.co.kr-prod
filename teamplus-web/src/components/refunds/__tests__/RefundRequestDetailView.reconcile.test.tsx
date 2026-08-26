/**
 * RefundRequestDetailView — KG_UNCONFIRMED reconcile 흐름 통합 테스트(RTL).
 *
 * 검증: ADMIN reconcile CTA → 시트 제출 시 계약 호출 · 성공(200) 후 reload+토스트+close ·
 *       409 서버메시지+reload · 일반 실패(500) 시 시트+memo 유지(재시도 가능). act 경고 0.
 */

import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { RefundRequestDetailView } from '@/components/refunds/RefundRequestDetailView';
import { MESSAGES } from '@/lib/messages';
import {
  getRefundRequestDetail,
  reconcileRefundRequest,
} from '@/services/payment';

jest.mock('@/services/payment', () => {
  const actual = jest.requireActual('@/services/payment');
  return {
    ...actual,
    getRefundRequestDetail: jest.fn(),
    reconcileRefundRequest: jest.fn(),
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
const reconcile = reconcileRefundRequest as jest.Mock;

function kgDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    status: 'execution_failed',
    sourceType: 'CLASS_PREPAID',
    subjectLabel: '테스트 수업',
    version: 2,
    scope: { sourceType: 'CLASS_PREPAID', teamId: 'team-1', academyId: null },
    payment: {
      orderNumber: 'O1',
      amount: 10000,
      paymentMethod: 'card',
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
      requestedAmount: 10000,
      createdAt: '2026-07-23T00:00:00Z',
    },
    usage: null,
    judgmentDataOk: false,
    snapshotVsCurrent: {
      requestedStatusAtCreate: 'completed',
      requestedAmount: 10000,
      currentPaymentStatus: 'completed',
    },
    decision: {
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionReason: null,
      failureStage: 'PG',
      failureCode: 'KG_UNCONFIRMED',
      failureReason: 'PG 미확정',
    },
    history: [],
    ...overrides,
  };
}

function renderView() {
  return render(
    <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
  );
}

/** ADMIN 상세 로드 → reconcile 시트 열고 outcome+memo 입력 후 제출(act 로 async 플러시). */
async function openAndSubmit() {
  const cta = await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta });
  fireEvent.click(cta);
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }),
  );
  fireEvent.change(
    screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder),
    { target: { value: 'PG 취소 확인함' } },
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
  });
}

describe('RefundRequestDetailView reconcile 흐름', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => cleanup());

  it('성공(200) — 계약 호출 + reload + 성공 토스트', async () => {
    getDetail
      .mockResolvedValueOnce({ success: true, data: kgDetail() })
      .mockResolvedValueOnce({
        success: true,
        data: kgDetail({ status: 'executed', decision: { ...kgDetail().decision, failureCode: null } }),
      });
    reconcile.mockResolvedValue({ success: true, data: { status: 'executed' } });

    renderView();
    await openAndSubmit();

    expect(reconcile).toHaveBeenCalledWith('req-1', {
      version: 2,
      outcome: 'CONFIRMED_CANCELLED',
      memo: 'PG 취소 확인함',
    });
    await waitFor(() => expect(getDetail).toHaveBeenCalledTimes(2)); // 초기 + reload
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.refund.reconcileSuccess);
  });

  it('409 — 서버 메시지 우선 표시 + reload', async () => {
    getDetail.mockResolvedValue({ success: true, data: kgDetail() });
    reconcile.mockResolvedValue({
      success: false,
      error: { statusCode: 409, message: '다른 담당자가 이미 처리했습니다.' },
    });

    renderView();
    await openAndSubmit();

    expect(toast.error).toHaveBeenCalledWith('다른 담당자가 이미 처리했습니다.');
    await waitFor(() => expect(getDetail).toHaveBeenCalledTimes(2)); // reload
  });

  it('일반 실패(500) — 실패 토스트 · reload 없음 · 시트+memo 유지', async () => {
    getDetail.mockResolvedValue({ success: true, data: kgDetail() });
    reconcile.mockResolvedValue({ success: false, error: { statusCode: 500 } });

    renderView();
    await openAndSubmit();

    expect(toast.error).toHaveBeenCalledWith(MESSAGES.refund.reconcileFailed);
    expect(getDetail).toHaveBeenCalledTimes(1); // reload 하지 않음
    // 시트가 닫히지 않고 memo 가 유지되어 재시도 가능.
    const memo = screen.getByPlaceholderText(
      MESSAGES.refund.reconcileMemoPlaceholder,
    ) as HTMLTextAreaElement;
    expect(memo).toBeInTheDocument();
    expect(memo.value).toBe('PG 취소 확인함');
  });
});

/** PG 결과 미확정 3종(KG · 토스 미확정 · 토스 멱등 충돌) CTA 노출 조합. */
describe('PG 정산 CTA 노출 조건', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => cleanup());

  function decision(failureCode: string) {
    return {
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionReason: null,
      failureStage: 'PG',
      failureCode,
      failureReason: 'PG 결과 미확정',
    };
  }
  function renderAs(userType: string) {
    return render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType={userType} onReady={jest.fn()} />,
    );
  }

  it('토스 미확정 — 정산 + 재처리 동시 노출(멱등 기간 내 재처리가 우선 경로)', async () => {
    getDetail.mockResolvedValue({
      success: true,
      data: kgDetail({ decision: decision('TOSS_UNCONFIRMED') }),
    });

    renderAs('admin');
    expect(
      await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: MESSAGES.refund.reprocessCta }),
    ).toBeInTheDocument();
    // 미확정 건은 거절 종결 대상이 아니다.
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.rejectCta }),
    ).toBeNull();
  });

  it('토스 멱등 충돌 — 재처리 숨김, 정산만 노출(같은 키 재호출로 해소 불가)', async () => {
    getDetail.mockResolvedValue({
      success: true,
      data: kgDetail({ decision: decision('TOSS_IDEMPOTENCY_CONFLICT') }),
    });

    renderAs('admin');
    expect(
      await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.reprocessCta }),
    ).toBeNull();
  });

  it('KG 미확정 — 재처리 숨김, 정산만 노출(기존 계약 유지)', async () => {
    getDetail.mockResolvedValue({ success: true, data: kgDetail() });

    renderAs('admin');
    expect(
      await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.reprocessCta }),
    ).toBeNull();
  });

  it('감독(비-ADMIN) — 정산 CTA 미노출', async () => {
    getDetail.mockResolvedValue({
      success: true,
      data: kgDetail({ decision: decision('TOSS_UNCONFIRMED') }),
    });

    renderAs('director');
    // 재처리는 감독도 가능하지만 정산 확정은 ADMIN 전용.
    expect(
      await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.reconcileCta }),
    ).toBeNull();
  });
});
