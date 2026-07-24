import { reconcileRefundRequest } from '../payment';
import { api } from '@/services/api-client';

// api-client 자동 모킹 — 요청 body 형태만 단언(네트워크 미발생).
jest.mock('@/services/api-client');

describe('reconcileRefundRequest 계약', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /refund-requests/:id/reconcile 에 { version, outcome, memo } 를 그대로 전달한다', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      success: true,
      data: { id: 'r1', status: 'executed' },
    });

    await reconcileRefundRequest('req-1', {
      version: 3,
      outcome: 'CONFIRMED_CANCELLED',
      memo: 'PG 취소 확인함',
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/refund-requests/req-1/reconcile', {
      version: 3,
      outcome: 'CONFIRMED_CANCELLED',
      memo: 'PG 취소 확인함',
    });
  });

  it('outcome=CONFIRMED_NOT_CANCELLED 도 계약대로 전달한다', async () => {
    (api.post as jest.Mock).mockResolvedValue({ success: true, data: {} });

    await reconcileRefundRequest('req-2', {
      version: 1,
      outcome: 'CONFIRMED_NOT_CANCELLED',
      memo: 'PG 미취소 확인함',
    });

    expect(api.post).toHaveBeenCalledWith('/refund-requests/req-2/reconcile', {
      version: 1,
      outcome: 'CONFIRMED_NOT_CANCELLED',
      memo: 'PG 미취소 확인함',
    });
  });

  it('body 에 version·outcome·memo 외 다른 키를 포함하지 않는다', async () => {
    (api.post as jest.Mock).mockResolvedValue({ success: true, data: {} });

    await reconcileRefundRequest('req-3', {
      version: 5,
      outcome: 'CONFIRMED_CANCELLED',
      memo: '메모',
    });

    const body = (api.post as jest.Mock).mock.calls[0][1];
    expect(Object.keys(body).sort()).toEqual(['memo', 'outcome', 'version']);
  });
});
