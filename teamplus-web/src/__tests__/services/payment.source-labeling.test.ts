/**
 * 결제 출처 표기 — payment 서비스 정규화 유닛 테스트 (작업 B · SPEC §6-2)
 *
 * 검증:
 *  - getPaymentHistory → toPaymentHistoryItem 이 백엔드 파생 필드 sourceType/billingTiming 을
 *    프론트 유니온으로 정규화한다.
 *  - 미제공/무효값은 undefined (배지 미표시) — 무관계 결제(매치·쇼핑) 오라벨 방지.
 *  - 기존 반환 키(id/amount/status/orderNumber 등)는 그대로 보존(Dual Emit 회귀).
 */

jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '@/services/api-client';
import { getPaymentHistory } from '@/services/payment';

const mockGet = api.get as jest.Mock;

describe('getPaymentHistory — 출처·선후불 정규화', () => {
  beforeEach(() => mockGet.mockReset());

  it('유효한 파생값을 프론트 유니온으로 정규화한다', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p1',
          orderNumber: 'ORD-1',
          amount: '30000',
          paymentStatus: 'completed',
          productName: '정기권',
          createdAt: '2026-07-01T00:00:00.000Z',
          sourceType: 'TOURNAMENT',
          billingTiming: 'POSTPAID',
        },
      ],
    });

    const res = await getPaymentHistory();
    const item = res.data!.payments[0];

    expect(item.sourceType).toBe('TOURNAMENT');
    expect(item.billingTiming).toBe('POSTPAID');
    // 기존 키 보존
    expect(item.id).toBe('p1');
    expect(item.orderNumber).toBe('ORD-1');
    expect(item.amount).toBe(30000);
    expect(item.status).toBe('completed');
  });

  it('선불 수업 결제 → CLASS/PREPAID 정규화', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p2',
          orderNumber: 'ORD-2',
          amount: 50000,
          paymentStatus: 'completed',
          createdAt: '2026-07-02T00:00:00.000Z',
          sourceType: 'CLASS',
          billingTiming: 'PREPAID',
        },
      ],
    });

    const item = (await getPaymentHistory()).data!.payments[0];
    expect(item.sourceType).toBe('CLASS');
    expect(item.billingTiming).toBe('PREPAID');
  });

  it('파생값 미제공 시 undefined (배지 미표시)', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p3',
          orderNumber: 'ORD-3',
          amount: 10000,
          paymentStatus: 'completed',
          createdAt: '2026-07-03T00:00:00.000Z',
        },
      ],
    });

    const item = (await getPaymentHistory()).data!.payments[0];
    expect(item.sourceType).toBeUndefined();
    expect(item.billingTiming).toBeUndefined();
  });

  it('무효/예상외 파생값은 undefined 로 처리', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p4',
          orderNumber: 'ORD-4',
          amount: 10000,
          paymentStatus: 'completed',
          createdAt: '2026-07-04T00:00:00.000Z',
          sourceType: 'UNASSIGNED',
          billingTiming: 'UNKNOWN',
        },
      ],
    });

    const item = (await getPaymentHistory()).data!.payments[0];
    expect(item.sourceType).toBeUndefined();
    expect(item.billingTiming).toBeUndefined();
  });

  it('null 파생값도 undefined 로 처리', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p5',
          orderNumber: 'ORD-5',
          amount: 10000,
          paymentStatus: 'completed',
          createdAt: '2026-07-05T00:00:00.000Z',
          sourceType: null,
          billingTiming: null,
        },
      ],
    });

    const item = (await getPaymentHistory()).data!.payments[0];
    expect(item.sourceType).toBeUndefined();
    expect(item.billingTiming).toBeUndefined();
  });
});
