import { listRefundRequests } from '../payment';
import { api } from '@/services/api-client';

jest.mock('@/services/api-client');

const getMock = api.get as jest.Mock;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    status: 'pending',
    sourceType: 'CLASS_PREPAID',
    subjectLabel: '테스트 수업',
    requesterName: '김부모',
    childName: null,
    createdAt: '2026-07-23T00:00:00Z',
    amount: 10000,
    waitingMinutes: 5,
    riskFlags: { used: false, postpaid: false, tournament: false },
    ...overrides,
  };
}

function listResponse(overrides: Record<string, unknown> = {}) {
  return {
    activeItems: [row({ status: 'pending' })],
    historyItems: [row({ id: 'h1', status: 'executed' })],
    pendingCount: 1,
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    ...overrides,
  };
}

describe('listRefundRequests fail-closed 계약', () => {
  beforeEach(() => jest.clearAllMocks());

  it('정상 계약이면 success + 두 배열을 반환한다', async () => {
    getMock.mockResolvedValue({ success: true, data: listResponse() });
    const res = await listRefundRequests({ scope: 'team' });
    expect(res.success).toBe(true);
    expect(res.data?.activeItems).toHaveLength(1);
    expect(res.data?.historyItems).toHaveLength(1);
  });

  it('activeItems 에 종결 상태(executed) 혼입 → 전체 실패', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: listResponse({ activeItems: [row({ status: 'executed' })] }),
    });
    const res = await listRefundRequests({ scope: 'team' });
    expect(res.success).toBe(false);
  });

  it('historyItems 에 처리대기 상태(pending) 혼입 → 전체 실패', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: listResponse({ historyItems: [row({ id: 'h1', status: 'pending' })] }),
    });
    const res = await listRefundRequests({ scope: 'team' });
    expect(res.success).toBe(false);
  });

  it('childName 이 숫자면 → 전체 실패(타입 오염)', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: listResponse({ activeItems: [row({ childName: 123 })] }),
    });
    const res = await listRefundRequests({ scope: 'team' });
    expect(res.success).toBe(false);
  });

  it('amount 가 음수/소수면 → 전체 실패', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: listResponse({ activeItems: [row({ amount: -1 })] }),
    });
    expect((await listRefundRequests({ scope: 'team' })).success).toBe(false);

    getMock.mockResolvedValue({
      success: true,
      data: listResponse({ activeItems: [row({ amount: 100.5 })] }),
    });
    expect((await listRefundRequests({ scope: 'team' })).success).toBe(false);
  });

  it('pagination 산식(totalPages !== ceil(total/limit)) 위반 → 전체 실패', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: listResponse({ pagination: { page: 1, limit: 20, total: 30, totalPages: 1 } }),
    });
    expect((await listRefundRequests({ scope: 'team' })).success).toBe(false);
  });
});
