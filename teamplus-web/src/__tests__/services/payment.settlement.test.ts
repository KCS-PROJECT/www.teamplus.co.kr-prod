/**
 * getTeamSettlementSummary 서비스 유닛 테스트 (Codex Phase 3 HIGH-2 회귀 방지)
 *
 * 검증:
 *  - 성공 시 필드 정규화(문자열/누락 unpaid → 숫자, 배열 아님 → 빈 배열, yearMonth 폴백)
 *  - 실패(res.success=false 또는 data 없음) 시 **throw** — 금융 화면에서 실패를
 *    정상 0/빈 결과로 위장하지 않는다.
 */

jest.mock('@/services/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '@/services/api-client';
import {
  getTeamSettlementSummary,
  getTeamUnpaidMembers,
  getTeamUnpaidMemberDetail,
  sendTeamUnpaidReminder,
  getAcademySettlementSummary,
} from '@/services/payment';

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

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

// 팀 인별 미수금 목록 — 금융 화면: 실패를 "미수금 0"으로 위장하지 않고 throw
describe('getTeamUnpaidMembers — 성공 정규화 / 실패 throw', () => {
  beforeEach(() => mockGet.mockReset());

  it('정상 응답 시 members·합계를 정규화하여 반환하고 파라미터 전달', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        yearMonth: '2026-07',
        members: [
          {
            memberId: 'u1',
            name: '홍길동',
            teamName: '팀A',
            outstandingAmount: '30000',
            sources: ['CLASS', 'TOURNAMENT'],
            classCount: 1,
            tournamentCount: 1,
          },
        ],
        totalOutstanding: '30000',
        totalCount: 1,
      },
    });

    const result = await getTeamUnpaidMembers({ yearMonth: '2026-07' });

    expect(result.yearMonth).toBe('2026-07');
    expect(result.members).toHaveLength(1);
    expect(result.members[0].memberId).toBe('u1');
    expect(result.members[0].outstandingAmount).toBe(30000);
    expect(result.members[0].sources).toEqual(['CLASS', 'TOURNAMENT']);
    expect(result.totalOutstanding).toBe(30000);
    expect(result.totalCount).toBe(1);
    expect(mockGet).toHaveBeenCalledWith('/payments/team-settlement-center/unpaid-members', {
      params: { yearMonth: '2026-07', teamId: undefined },
    });
  });

  it('members·합계 누락 → 빈 배열/0 정규화, yearMonth 요청값 폴백', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { yearMonth: '', members: undefined, totalOutstanding: undefined, totalCount: undefined },
    });

    const result = await getTeamUnpaidMembers({ yearMonth: '2026-06' });

    expect(result.yearMonth).toBe('2026-06');
    expect(result.members).toEqual([]);
    expect(result.totalOutstanding).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('res.success=false 면 error.message 로 throw', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    });

    await expect(getTeamUnpaidMembers({ yearMonth: '2026-07' })).rejects.toThrow('권한이 없습니다.');
  });

  it('data 가 없으면 기본 메시지로 throw', async () => {
    mockGet.mockResolvedValue({ success: true, data: null });

    await expect(getTeamUnpaidMembers({ yearMonth: '2026-07' })).rejects.toThrow(
      'team unpaid members load failed',
    );
  });

  it('API 자체가 reject 하면 그대로 전파', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    await expect(getTeamUnpaidMembers({ yearMonth: '2026-07' })).rejects.toThrow('network down');
  });
});

describe('getTeamUnpaidMemberDetail — 성공 정규화 / 404 throw (IDOR)', () => {
  beforeEach(() => mockGet.mockReset());

  it('정상 응답 시 member/parents/details 정규화, attendanceCount 조건부 포함', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        member: { id: 'u1', name: '홍길동', totalOutstanding: '30000' },
        parents: [{ id: 'p1', name: '홍부모', phone: '010-0000-0000' }],
        details: [
          {
            sourceType: 'CLASS',
            sourceId: 'c1',
            sourceName: '수업A',
            teamName: '팀A',
            billingTiming: 'POSTPAID',
            yearMonth: '2026-07',
            amount: '20000',
            attendanceCount: 4,
          },
          {
            sourceType: 'TOURNAMENT',
            sourceId: 't1',
            sourceName: '대회A',
            teamName: '팀A',
            billingTiming: 'POSTPAID',
            yearMonth: '2026-07',
            amount: '10000',
          },
        ],
      },
    });

    const result = await getTeamUnpaidMemberDetail({ memberId: 'u1', yearMonth: '2026-07' });

    expect(result.member.totalOutstanding).toBe(30000);
    expect(result.parents).toHaveLength(1);
    expect(result.details).toHaveLength(2);
    expect(result.details[0].amount).toBe(20000);
    expect(result.details[0].attendanceCount).toBe(4);
    expect(result.details[1].sourceType).toBe('TOURNAMENT');
    expect(result.details[1].attendanceCount).toBeUndefined();
    expect(mockGet).toHaveBeenCalledWith(
      '/payments/team-settlement-center/unpaid-members/u1',
      { params: { yearMonth: '2026-07', teamId: undefined } },
    );
  });

  it('scope 밖·미납 0건 404 → throw (IDOR 가드)', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: '미수금 내역을 찾을 수 없습니다.' },
    });

    await expect(
      getTeamUnpaidMemberDetail({ memberId: 'x', yearMonth: '2026-07' }),
    ).rejects.toThrow('미수금 내역을 찾을 수 없습니다.');
  });
});

describe('sendTeamUnpaidReminder — 성공 정규화 / 실패 throw', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('정상 응답 시 sent/cooldown/recipientCount 정규화 + yearMonth body 전달', async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: { sent: true, cooldown: false, recipientCount: '2' },
    });

    const result = await sendTeamUnpaidReminder({ memberId: 'u1', yearMonth: '2026-07' });

    expect(result).toEqual({ sent: true, cooldown: false, recipientCount: 2 });
    expect(mockPost).toHaveBeenCalledWith(
      '/payments/team-settlement-center/unpaid-members/u1/remind',
      { yearMonth: '2026-07' },
    );
  });

  it('res.success=false 면 error.message 로 throw', async () => {
    mockPost.mockResolvedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
    });

    await expect(
      sendTeamUnpaidReminder({ memberId: 'u1', yearMonth: '2026-07' }),
    ).rejects.toThrow('권한이 없습니다.');
  });

  it('data 가 없으면 기본 메시지로 throw', async () => {
    mockPost.mockResolvedValue({ success: true, data: null });

    await expect(
      sendTeamUnpaidReminder({ memberId: 'u1', yearMonth: '2026-07' }),
    ).rejects.toThrow('unpaid reminder send failed');
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
