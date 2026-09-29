import { buildEndedChildrenSummary } from '../ended-class-children';

describe('buildEndedChildrenSummary', () => {
  const children = [
    { id: 'c1', name: '안하나' },
    { id: 'c2', name: '안두리' },
  ];
  const present = (d: string) => ({ scheduledDate: `${d}T00:00:00.000Z`, attendanceStatus: 'present' });

  it('취소·환불만 있고 출석이 없는 자녀는 제외', () => {
    const result = buildEndedChildrenSummary(
      children,
      [
        { childId: 'c1', status: 'cancelled', billingMonth: '2026-08', isPostpaid: false },
        { childId: 'c2', status: 'refunded', billingMonth: '2026-08', isPostpaid: false },
      ],
      new Map([['c1', []], ['c2', []]]),
    );
    expect(result).toEqual([]);
  });

  it('후불 expired 이력이어도 출석이 있으면 포함', () => {
    const result = buildEndedChildrenSummary(
      children,
      [{ childId: 'c1', status: 'expired', billingMonth: '2026-07', isPostpaid: true }],
      new Map([['c1', [present('2026-07-13')]], ['c2', []]]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].months).toEqual([{ yearMonth: '2026-07', presentCount: 1 }]);
  });

  it('결제월에 출석이 없으면 0회 행, absent·unchecked 는 세지 않음, 월 오름차순', () => {
    const result = buildEndedChildrenSummary(
      children,
      [
        { childId: 'c1', status: 'paid', billingMonth: '2026-09', isPostpaid: false },
        { childId: 'c1', status: 'paid', billingMonth: '2026-08', isPostpaid: false },
      ],
      new Map([
        [
          'c1',
          [
            present('2026-08-03'),
            present('2026-08-10'),
            { scheduledDate: '2026-08-17T00:00:00.000Z', attendanceStatus: 'absent' },
            { scheduledDate: '2026-09-07T00:00:00.000Z', attendanceStatus: 'unchecked' },
          ],
        ],
      ]),
    );
    expect(result[0].months).toEqual([
      { yearMonth: '2026-08', presentCount: 2 },
      { yearMonth: '2026-09', presentCount: 0 },
    ]);
    expect(result[0].hasPrepaid).toBe(true);
    expect(result[0].hasPostpaid).toBe(false);
  });

  it('선불 approved(승인 후 미결제)는 수강 이력이 아님 — 출석 없으면 제외', () => {
    const result = buildEndedChildrenSummary(
      children,
      [{ childId: 'c1', status: 'approved', billingMonth: '2026-08', isPostpaid: false }],
      new Map([['c1', []], ['c2', []]]),
    );
    expect(result).toEqual([]);
  });

  it('출석 조회 실패(null)는 결제 이력만으로 표시하고 실패 표식을 남김', () => {
    const result = buildEndedChildrenSummary(
      children,
      [{ childId: 'c2', status: 'approved', billingMonth: '2026-08', isPostpaid: true }],
      new Map([['c1', []], ['c2', null]]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].attendanceUnavailable).toBe(true);
    expect(result[0].hasPostpaid).toBe(true);
  });
});
