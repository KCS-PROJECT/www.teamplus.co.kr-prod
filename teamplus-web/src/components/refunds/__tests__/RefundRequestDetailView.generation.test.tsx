/**
 * RefundRequestDetailView — stale action 동기 가드(currentRequestIdRef 단일 기준) 테스트(RTL).
 *
 * ① 이전 requestId 조회 응답이 늦게 도착해도(out-of-order) 최신 requestId 상세를 덮지 않는다.
 * ② req-1 action 진행 중 req-2 로 전환 후 req-1 action 이 늦게 완료돼도, 그 후속 reload 가
 *    새 세대를 발급하지 못해 req-2 상세가 req-1 로 역전되지 않는다(stale action silent abort).
 * ③ req-2 reconcile 를 실제 in-flight(processing/disabled)로 만든 뒤 늦은 req-1 이 완료돼도, stale
 *    finally 가 req-2 의 processing 을 풀지 않고 시트·메모도 유지된다(자기 요청 완료 시에만 잠금 해제).
 * ④ req-1 재처리 확인 모달 대기 중 req-2 로 전환하면, 모달이 뒤늦게 확인돼도 이전 환불 ID 로
 *    reprocessRefundRequest 가 호출되지 않는다(모달 응답 후 API 호출 전 동기 재검증).
 * ⑤ req-1 retry 지연 + req-2 조회도 지연(pending) 상태에서 req-2 조회 완료 **전에** req-1 응답을
 *    먼저 완료해도 req-2 를 덮지 않는다(render→passive-effect 경합창 직접 재현).
 * ⑥ req-1 stale refresh 로 ⑤ 와 동일한 조회 완료 전 경합창을 검증한다.
 *   ⑤·⑥ 은 모든 상세 fetch 경로(retry/refresh)에도 action 과 동일한 requestId 불변조건을 적용한다.
 */

import { render, screen, act, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { RefundRequestDetailView } from '@/components/refunds/RefundRequestDetailView';
import { MESSAGES } from '@/lib/messages';
import {
  getRefundRequestDetail,
  reconcileRefundRequest,
  reprocessRefundRequest,
} from '@/services/payment';

jest.mock('@/services/payment', () => {
  const actual = jest.requireActual('@/services/payment');
  return {
    ...actual,
    getRefundRequestDetail: jest.fn(),
    reconcileRefundRequest: jest.fn(),
    reprocessRefundRequest: jest.fn(),
  };
});
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }));
// 모듈 레벨 제어형 confirm — 테스트별로 지연/즉시 응답을 주입한다(재처리 모달 경합창 검증).
const mockModalConfirm = jest.fn();
jest.mock('@/components/ui/Modal/ModalContext', () => ({
  useModal: () => ({ modal: { confirm: (...args: unknown[]) => mockModalConfirm(...args) } }),
}));
jest.mock('@/hooks/useNavigation', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const getDetail = getRefundRequestDetail as jest.Mock;
const reconcile = reconcileRefundRequest as jest.Mock;
const reprocess = reprocessRefundRequest as jest.Mock;

function base(id: string, label: string) {
  return {
    id,
    sourceType: 'CLASS_PREPAID',
    subjectLabel: label,
    version: 1,
    scope: { sourceType: 'CLASS_PREPAID', teamId: 'team-1', academyId: null },
    payment: {
      orderNumber: 'O', amount: 10000, paymentMethod: 'card', tid: null,
      currentStatus: 'refunded', completedAt: null, product: '이용권',
    },
    request: {
      requesterName: '김부모', requesterPhone: null, childName: null,
      requestReason: '사유', requestedAmount: 10000, createdAt: '2026-07-23T00:00:00Z',
    },
    usage: null,
    judgmentDataOk: false,
    snapshotVsCurrent: { requestedStatusAtCreate: 'completed', requestedAmount: 10000, currentPaymentStatus: 'refunded' },
    history: [],
  };
}
/** 종결 상세(executed) — CTA 없음. */
function done(id: string, label: string) {
  return {
    ...base(id, label),
    status: 'executed',
    decision: { decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null, failureStage: null, failureCode: null, failureReason: null },
  };
}
/** KG 미확정 상세 — ADMIN reconcile CTA 노출. */
function kg(id: string, label: string) {
  return {
    ...base(id, label),
    status: 'execution_failed',
    decision: { decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null, failureStage: 'PG', failureCode: 'KG_UNCONFIRMED', failureReason: 'PG 미확정' },
  };
}
/** 재처리 가능 상세 — execution_failed + 일반 실패(KG 미확정 아님) → 재처리 CTA 노출. */
function failed(id: string, label: string) {
  return {
    ...base(id, label),
    status: 'execution_failed',
    decision: { decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null, failureStage: 'PG', failureCode: null, failureReason: 'PG 실패' },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('RefundRequestDetailView 세대·stale action 가드', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModalConfirm.mockReset();
    mockModalConfirm.mockResolvedValue(true); // 기본 즉시 확인
  });
  afterEach(() => cleanup());

  it('① 늦게 도착한 이전 requestId 응답이 최신 상세를 덮지 않는다', async () => {
    const d1 = deferred<unknown>();
    getDetail
      .mockReturnValueOnce(d1.promise) // req-1 (pending)
      .mockResolvedValueOnce({ success: true, data: done('req-2', 'REQ2 상세') });

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="director" onReady={jest.fn()} />,
    );
    await act(async () => {
      rerender(
        <RefundRequestDetailView requestId="req-2" scope="team" userType="director" onReady={jest.fn()} />,
      );
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();

    await act(async () => {
      d1.resolve({ success: true, data: done('req-1', 'REQ1 상세') });
    });
    expect(screen.getByText('REQ2 상세')).toBeInTheDocument();
    expect(screen.queryByText('REQ1 상세')).toBeNull();
  });

  it('② req-1 action 진행 중 req-2 전환 → req-1 action resolve 해도 req-2 상세 유지', async () => {
    const rec = deferred<{ success: boolean; data: { status: string } }>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') }) // req-1 초기
      .mockResolvedValueOnce({ success: true, data: done('req-2', 'REQ2 상세') }); // req-2 초기
    reconcile.mockReturnValueOnce(rec.promise); // req-1 reconcile — 지연

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    // req-1 reconcile 제출(응답 지연 상태로 in-flight).
    const cta = await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta });
    fireEvent.click(cta);
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }));
    fireEvent.change(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder), {
      target: { value: '메모' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
    });
    expect(reconcile).toHaveBeenCalledTimes(1);

    // req-2 로 전환(새 라우트 epoch).
    await act(async () => {
      rerender(
        <RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />,
      );
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();

    // 뒤늦게 req-1 reconcile 완료 — stale action: reload/토스트/시트/write 어떤 부수효과도 없어야 한다.
    await act(async () => {
      rec.resolve({ success: true, data: { status: 'executed' } });
    });
    await waitFor(() => expect(screen.getByText('REQ2 상세')).toBeInTheDocument());

    // ① req-1 재조회(fetch) 0회 — 초기 req-1 조회 1회뿐, stale reload 로 인한 req-1 재fetch 없음.
    expect(getDetail.mock.calls.filter((c) => c[0] === 'req-1')).toHaveLength(1);
    expect(getDetail).toHaveBeenCalledTimes(2); // req-1 초기 + req-2 초기만
    // ② 화면이 계속 req-2 상세.
    expect(screen.getByText('REQ2 상세')).toBeInTheDocument();
    expect(screen.queryByText('REQ1 상세')).toBeNull();
    // ③ 이전 action 의 toast 미발생(성공/실패 모두).
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    // ④ sheet·loading 상태가 새 화면을 변경하지 않음 — req-2(executed)엔 reconcile CTA·시트 없음,
    //    로딩 스피너 아닌 실제 상세가 표시됨(null 렌더 아님).
    expect(
      screen.queryByRole('button', { name: MESSAGES.refund.reconcileCta }),
    ).toBeNull();
    expect(
      screen.queryByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder),
    ).toBeNull();
  });

  it('③ req-2 reconcile in-flight(disabled) 중 늦은 req-1 완료 → req-2 processing/시트/메모 무이월', async () => {
    const rec1 = deferred<{ success: boolean; data?: { status: string }; error?: { statusCode: number; message: string } }>();
    const rec2 = deferred<{ success: boolean; data?: { status: string }; error?: { statusCode: number; message: string } }>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') }) // req-1 초기(reconcile 가능)
      .mockResolvedValueOnce({ success: true, data: kg('req-2', 'REQ2 상세') }); // req-2 초기(reconcile 가능)
    reconcile
      .mockReturnValueOnce(rec1.promise) // req-1 reconcile — 지연
      .mockReturnValueOnce(rec2.promise); // req-2 reconcile — 지연

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    // req-1 reconcile 제출(in-flight).
    fireEvent.click(await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }));
    fireEvent.change(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder), {
      target: { value: 'req-1 메모' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
    });
    expect(reconcile).toHaveBeenCalledTimes(1);

    // req-2 로 전환(reconcile 가능 상세) — 시트/loading 초기화됨.
    await act(async () => {
      rerender(
        <RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />,
      );
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();

    // req-2 시트를 새로 열고 제출 → req-2 를 실제 in-flight(processing/disabled) 상태로 만든다.
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileCta }));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }));
    fireEvent.change(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder), {
      target: { value: 'req-2 메모' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
    });
    expect(reconcile).toHaveBeenCalledTimes(2);
    // req-2 확인 버튼이 processing(잠금) 상태인지 확인 — 이후 stale 완료가 이 상태를 풀면 회귀.
    expect(
      screen.getByRole('button', { name: MESSAGES.refund.reconcileProcessing }),
    ).toBeDisabled();

    // 뒤늦게 req-1 reconcile 완료 — stale action 의 finally 가 req-2 processing 을 풀면 안 된다.
    await act(async () => {
      rec1.resolve({ success: true, data: { status: 'executed' } });
    });
    await waitFor(() => expect(screen.getByText('REQ2 상세')).toBeInTheDocument());
    // ① req-2 는 여전히 processing/disabled(자기 요청 미완료).
    expect(
      screen.getByRole('button', { name: MESSAGES.refund.reconcileProcessing }),
    ).toBeDisabled();
    // ② req-2 시트·메모 유지.
    expect(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder)).toHaveValue('req-2 메모');
    // ③ 이전(stale) action 의 toast 미발생.
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    // req-2 자기 요청 완료(일반 실패 → 시트 유지·processing 해제) 후에만 잠금 해제된다.
    await act(async () => {
      rec2.resolve({ success: false, error: { statusCode: 500, message: '처리 실패' } });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm })).not.toBeDisabled(),
    );
    // req-2 메모 유지 + 자기 실패 toast 는 1회(stale req-1 성공 toast 는 없어야 함).
    expect(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder)).toHaveValue('req-2 메모');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('④ req-1 재처리 모달 대기 중 req-2 전환 → 모달 확인돼도 이전 환불 재처리 API 미호출', async () => {
    const confirmDeferred = deferred<boolean>();
    mockModalConfirm.mockReturnValueOnce(confirmDeferred.promise); // 재처리 확인 모달 — 지연
    getDetail
      .mockResolvedValueOnce({ success: true, data: failed('req-1', 'REQ1 상세') }) // req-1 초기(재처리 가능)
      .mockResolvedValueOnce({ success: true, data: done('req-2', 'REQ2 상세') }); // req-2 초기(종결)

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    // req-1 재처리 클릭 → 확인 모달 오픈(응답 대기, 아직 API 호출 전).
    fireEvent.click(await screen.findByRole('button', { name: MESSAGES.refund.reprocessCta }));
    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    expect(reprocess).not.toHaveBeenCalled();

    // req-2 로 전환.
    await act(async () => {
      rerender(
        <RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />,
      );
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();

    // 뒤늦게 모달 확인(true) — 라우트가 req-2 이므로 이전 환불(req-1) 재처리 API 는 호출되면 안 된다.
    await act(async () => {
      confirmDeferred.resolve(true);
    });
    await waitFor(() => expect(screen.getByText('REQ2 상세')).toBeInTheDocument());

    expect(reprocess).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('⑤ req-1 retry 지연 중 req-2 render(조회 완료 전) → 이전 req-1 응답이 req-2 를 덮지 않음', async () => {
    const retry1 = deferred<unknown>();
    const req2 = deferred<unknown>();
    getDetail
      .mockResolvedValueOnce({ success: false, error: { statusCode: 500, message: '로드 실패' } }) // req-1 초기 실패 → 오류 화면
      .mockReturnValueOnce(retry1.promise) // req-1 retry — 지연
      .mockReturnValueOnce(req2.promise); // req-2 초기 — 지연(조회 미완료 상태로 경합창 유지)

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="director" onReady={jest.fn()} />,
    );
    // 초기 로드 실패 → 재시도 버튼 클릭(retry in-flight).
    const retryBtn = await screen.findByRole('button', { name: MESSAGES.refund.retry });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // render→passive-effect 경합창 직접 재현: 같은 act 안에서 req-2 로 rerender(커밋) 직후,
    //   req-2 의 passive effect(조회 세대 증가)가 실행되기 **전에** 이전 req-1 retry 응답을 완료한다.
    //   requestId 동기 가드 제거 시(세대 검사만 남기면) 이 순서에서 req-1 이 기록되어 실패한다.
    await act(async () => {
      rerender(
        <RefundRequestDetailView requestId="req-2" scope="team" userType="director" onReady={jest.fn()} />,
      );
      retry1.resolve({ success: true, data: done('req-1', 'REQ1 상세') });
    });
    // 이전 req-1 응답은 currentRequestIdRef(=req-2) 동기 가드로 억제 — req-2 에 미기록.
    expect(screen.queryByText('REQ1 상세')).toBeNull();

    // req-2 조회 완료 → req-2 상세만 표시.
    await act(async () => {
      req2.resolve({ success: true, data: done('req-2', 'REQ2 상세') });
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();
    expect(screen.queryByText('REQ1 상세')).toBeNull();
  });

  it('⑥ req-1 stale refresh 지연 중 req-2 render(조회 완료 전) → 이전 req-1 응답이 req-2 를 덮지 않음', async () => {
    const refresh1 = deferred<unknown>();
    const req2 = deferred<unknown>();
    getDetail
      .mockResolvedValueOnce({ success: true, data: kg('req-1', 'REQ1 상세') }) // req-1 초기(reconcile 가능)
      .mockResolvedValueOnce({ success: false, error: { statusCode: 500, message: '재조회 실패' } }) // reconcile 후 reload 실패 → staleReload
      .mockReturnValueOnce(refresh1.promise) // stale refresh — 지연
      .mockReturnValueOnce(req2.promise); // req-2 초기 — 지연(조회 미완료 상태로 경합창 유지)
    reconcile.mockResolvedValueOnce({ success: true, data: { status: 'executed' } });

    const { rerender } = render(
      <RefundRequestDetailView requestId="req-1" scope="team" userType="admin" onReady={jest.fn()} />,
    );
    // reconcile 성공 → 후속 reload 실패 → staleReload 진입(새로고침 버튼 노출).
    fireEvent.click(await screen.findByRole('button', { name: MESSAGES.refund.reconcileCta }));
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) }));
    fireEvent.change(screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder), {
      target: { value: '메모' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MESSAGES.refund.reconcileConfirm }));
    });
    const refreshBtn = await screen.findByRole('button', { name: MESSAGES.refund.refreshAction });
    // stale refresh 클릭(in-flight).
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    // 같은 act 안에서 req-2 로 rerender(커밋) 직후, req-2 passive effect 실행 전에 이전 req-1
    //   stale refresh 응답을 완료 — requestId 동기 가드로 억제되어야 한다.
    await act(async () => {
      rerender(
        <RefundRequestDetailView requestId="req-2" scope="team" userType="admin" onReady={jest.fn()} />,
      );
      refresh1.resolve({ success: true, data: kg('req-1', 'REQ1 상세') });
    });
    expect(screen.queryByText('REQ1 상세')).toBeNull();

    // req-2 조회 완료 → req-2 상세만 표시.
    await act(async () => {
      req2.resolve({ success: true, data: done('req-2', 'REQ2 상세') });
    });
    expect(await screen.findByText('REQ2 상세')).toBeInTheDocument();
    expect(screen.queryByText('REQ1 상세')).toBeNull();
  });
});
