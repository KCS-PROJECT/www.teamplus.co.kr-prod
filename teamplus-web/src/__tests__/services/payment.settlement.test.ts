/**
 * getTeamSettlementSummary 서비스 유닛 테스트 (Codex Phase 3 HIGH-2 회귀 방지)
 *
 * 검증:
 *  - 성공 시 필드 정규화(문자열/누락 unpaid → 숫자, 배열 아님 → 빈 배열, yearMonth 폴백)
 *  - 실패(res.success=false 또는 data 없음) 시 **throw** — 금융 화면에서 실패를
 *    정상 0/빈 결과로 위장하지 않는다.
 */

jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn() },
}));

import { api } from '@/services/api-client';
import {
  getTeamSettlementSummary,
  getDirectorPaymentSummary,
  getAcademySettlementSummary,
} from '@/services/payment';

const mockGet = api.get as jest.Mock;

describe('getTeamSettlementSummary — 성공 정규화', () => {
  beforeEach(() => mockGet.mockReset());

  it('정상 응답 시 필드를 정규화하여 반환', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        yearMonth: '2026-07',
        classes: [{ classId: 'c1' }],
        tournaments: [{ tournamentId: 't1' }],
        unpaid: { amount: 12000, count: 3 },
      },
    });

    const result = await getTeamSettlementSummary({ yearMonth: '2026-07' });

    expect(result.yearMonth).toBe('2026-07');
    expect(result.classes).toHaveLength(1);
    expect(result.tournaments).toHaveLength(1);
    expect(result.unpaid).toEqual({ amount: 12000, count: 3 });
  });

  it('unpaid 누락·배열 아님 → 0/빈 배열로 정규화, yearMonth 는 요청값 폴백', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        yearMonth: '',
        classes: undefined,
        tournaments: null,
        unpaid: undefined,
      },
    });

    const result = await getTeamSettlementSummary({ yearMonth: '2026-06' });

    expect(result.yearMonth).toBe('2026-06'); // raw.yearMonth 빈 문자열 → 폴백
    expect(result.classes).toEqual([]);
    expect(result.tournaments).toEqual([]);
    expect(result.unpaid).toEqual({ amount: 0, count: 0 });
  });
});

describe('getTeamSettlementSummary — 실패 시 throw', () => {
  beforeEach(() => mockGet.mockReset());

  it('res.success=false 면 error.message 로 throw', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    });

    await expect(
      getTeamSettlementSummary({ yearMonth: '2026-07' }),
    ).rejects.toThrow('권한이 없습니다.');
  });

  it('data 가 없으면 기본 메시지로 throw', async () => {
    mockGet.mockResolvedValue({ success: true, data: null });

    await expect(
      getTeamSettlementSummary({ yearMonth: '2026-07' }),
    ).rejects.toThrow('settlement summary load failed');
  });

  it('API 자체가 reject 하면 그대로 전파', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    await expect(
      getTeamSettlementSummary({ yearMonth: '2026-07' }),
    ).rejects.toThrow('network down');
  });
});

// 미수금 탭(레거시) — 금융 화면: 실패를 "미수금 0"으로 위장하지 않고 throw (HIGH-1)
describe('getDirectorPaymentSummary — 실패 시 throw', () => {
  beforeEach(() => mockGet.mockReset());

  it('res.success=false 면 error.message 로 throw', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    });

    await expect(getDirectorPaymentSummary()).rejects.toThrow('권한이 없습니다.');
  });

  it('data 가 없으면 기본 메시지로 throw', async () => {
    mockGet.mockResolvedValue({ success: true, data: null });

    await expect(getDirectorPaymentSummary()).rejects.toThrow(
      'director payment summary load failed',
    );
  });

  it('API 자체가 reject 하면 그대로 전파', async () => {
    mockGet.mockRejectedValue(new Error('legacy network down'));

    await expect(getDirectorPaymentSummary()).rejects.toThrow('legacy network down');
  });

  it('정상 응답 시 필드를 정규화하여 반환', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        summary: { unpaidCount: '2' },
        unpaidMembers: [
          { id: 'm1', name: '홍길동', teamName: '팀A', amount: '5000', billingType: 'POSTPAID' },
        ],
      },
    });

    const result = await getDirectorPaymentSummary();

    expect(result.summary.unpaidCount).toBe(2);
    expect(result.unpaidMembers).toHaveLength(1);
    expect(result.unpaidMembers[0].amount).toBe(5000);
    expect(result.unpaidMembers[0].billingType).toBe('POSTPAID');
  });
});

// 오픈클래스 정산 — 팀 허브와 동일 계약(성공 정규화 + 실패 throw). 대회 축 없음.
describe('getAcademySettlementSummary — 성공 정규화', () => {
  beforeEach(() => mockGet.mockReset());

  it('정상 응답 시 필드를 정규화하여 반환하고 academyId·yearMonth 를 보존', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        yearMonth: '2026-07',
        academyId: 'a1',
        classes: [{ classId: 'c1' }],
        unpaid: { amount: 8000, count: 2 },
      },
    });

    const result = await getAcademySettlementSummary({ academyId: 'a1', yearMonth: '2026-07' });

    expect(result.yearMonth).toBe('2026-07');
    expect(result.academyId).toBe('a1');
    expect(result.classes).toHaveLength(1);
    expect(result.unpaid).toEqual({ amount: 8000, count: 2 });
    // 엔드포인트 · yearMonth 파라미터 전달 확인
    expect(mockGet).toHaveBeenCalledWith('/academies/a1/settlement-summary', {
      params: { yearMonth: '2026-07' },
    });
  });

  it('classes 누락·unpaid 누락 → 빈 배열/0 정규화, yearMonth·academyId 는 요청값 폴백', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        yearMonth: '',
        academyId: '',
        classes: undefined,
        unpaid: undefined,
      },
    });

    const result = await getAcademySettlementSummary({ academyId: 'a9', yearMonth: '2026-06' });

    expect(result.yearMonth).toBe('2026-06'); // raw 빈 문자열 → 폴백
    expect(result.academyId).toBe('a9'); // raw 빈 문자열 → 요청 academyId 폴백
    expect(result.classes).toEqual([]);
    expect(result.unpaid).toEqual({ amount: 0, count: 0 });
  });
});

describe('getAcademySettlementSummary — 실패 시 throw', () => {
  beforeEach(() => mockGet.mockReset());

  it('res.success=false 면 error.message 로 throw', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    });

    await expect(
      getAcademySettlementSummary({ academyId: 'a1', yearMonth: '2026-07' }),
    ).rejects.toThrow('권한이 없습니다.');
  });

  it('data 가 없으면 기본 메시지로 throw', async () => {
    mockGet.mockResolvedValue({ success: true, data: null });

    await expect(
      getAcademySettlementSummary({ academyId: 'a1', yearMonth: '2026-07' }),
    ).rejects.toThrow('academy settlement summary load failed');
  });

  it('API 자체가 reject 하면 그대로 전파', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    await expect(
      getAcademySettlementSummary({ academyId: 'a1', yearMonth: '2026-07' }),
    ).rejects.toThrow('network down');
  });
});
