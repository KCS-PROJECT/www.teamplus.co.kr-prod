/**
 * tournament.service 순수 헬퍼 함수 유닛 테스트
 *
 * 테스트 범위:
 *  - canManageMatch: RBAC 판정 (ADMIN/DIRECTOR/COACH만 true)
 *  - calculateDDay: D-Day 계산 (과거/오늘/미래/없음)
 *  - mapTournamentUiStatus: 대회 상태 → UI 상태 매핑
 *
 * 의존성 없음 — 순수 함수이므로 mocking 필요 없음.
 */

import {
  canManageMatch,
  calculateDDay,
  canCancelTournamentRegistration,
  mapTournamentUiStatus,
  buildTournamentChildOptions,
  isTournamentChildApplicable,
  type TournamentChildInput,
  type TournamentDetail,
} from '@/services/tournament.service';

describe('tournament.service — canManageMatch', () => {
  it('ADMIN/DIRECTOR/COACH만 true 반환', () => {
    expect(canManageMatch('ADMIN')).toBe(true);
    expect(canManageMatch('DIRECTOR')).toBe(true);
    expect(canManageMatch('COACH')).toBe(true);
  });

  it('소문자도 대소문자 무시하고 true 반환', () => {
    expect(canManageMatch('admin')).toBe(true);
    expect(canManageMatch('director')).toBe(true);
    expect(canManageMatch('coach')).toBe(true);
  });

  it('PARENT/TEEN/CHILD는 조회 전용 — false 반환', () => {
    expect(canManageMatch('PARENT')).toBe(false);
    expect(canManageMatch('TEEN')).toBe(false);
    expect(canManageMatch('CHILD')).toBe(false);
    expect(canManageMatch('parent')).toBe(false);
    expect(canManageMatch('teen')).toBe(false);
    expect(canManageMatch('child')).toBe(false);
  });

  it('ACADEMY_DIRECTOR는 조회 전용 — false 반환 (픽업매치 전담 역할)', () => {
    expect(canManageMatch('ACADEMY_DIRECTOR')).toBe(false);
    expect(canManageMatch('academy_director')).toBe(false);
  });

  it('undefined/null/빈문자열은 false 반환', () => {
    expect(canManageMatch(undefined)).toBe(false);
    expect(canManageMatch(null)).toBe(false);
    expect(canManageMatch('')).toBe(false);
  });

  it('알 수 없는 역할은 false 반환', () => {
    expect(canManageMatch('SUPERADMIN')).toBe(false);
    expect(canManageMatch('anonymous')).toBe(false);
  });
});

describe('tournament.service — calculateDDay', () => {
  const NOW = new Date('2026-04-12T10:00:00Z');

  it('마감일이 null이면 undefined 반환', () => {
    expect(calculateDDay(null, NOW)).toBeUndefined();
  });

  it('이미 지난 마감일은 undefined 반환', () => {
    expect(calculateDDay('2026-04-10T10:00:00Z', NOW)).toBeUndefined();
  });

  it('5일 후 마감 → 5 반환', () => {
    const deadline = new Date(NOW);
    deadline.setDate(deadline.getDate() + 5);
    expect(calculateDDay(deadline.toISOString(), NOW)).toBe(5);
  });

  it('내일 마감 → 1 반환', () => {
    const deadline = new Date(NOW);
    deadline.setDate(deadline.getDate() + 1);
    expect(calculateDDay(deadline.toISOString(), NOW)).toBe(1);
  });

  it('잘못된 날짜 문자열은 undefined 반환', () => {
    expect(calculateDDay('not-a-date', NOW)).toBeUndefined();
  });
});

describe('tournament.service — mapTournamentUiStatus', () => {
  const NOW = new Date('2026-04-12T10:00:00Z');

  it('cancelled 상태는 cancelled 반환', () => {
    expect(mapTournamentUiStatus('cancelled', null, NOW)).toBe('cancelled');
    expect(mapTournamentUiStatus('cancelled', '2030-01-01', NOW)).toBe(
      'cancelled',
    );
  });

  it('finished 상태는 completed 반환', () => {
    expect(mapTournamentUiStatus('finished', null, NOW)).toBe('completed');
  });

  it('ongoing 상태는 in_progress 반환', () => {
    expect(mapTournamentUiStatus('ongoing', null, NOW)).toBe('in_progress');
  });

  // [2026-06-08] 모집마감일 폐지 — scheduled 는 종료일 전이면 항상 recruiting.
  it('scheduled + 종료일 없음 → recruiting (상시 모집)', () => {
    expect(mapTournamentUiStatus('scheduled', null, NOW)).toBe('recruiting');
  });

  it('scheduled + 종료일 미래 → recruiting', () => {
    const endDate = new Date(NOW);
    endDate.setDate(endDate.getDate() + 2);
    expect(mapTournamentUiStatus('scheduled', endDate.toISOString(), NOW)).toBe(
      'recruiting',
    );
  });

  // [2026-06-22] 종료일이 지나면 status 자동 전이가 없어도 날짜 기준으로 completed 보정.
  it('scheduled + 종료일 과거 → completed (자동 종료 보정)', () => {
    const endDate = new Date(NOW);
    endDate.setDate(endDate.getDate() - 1);
    expect(mapTournamentUiStatus('scheduled', endDate.toISOString(), NOW)).toBe(
      'completed',
    );
  });

  // day-level(KST) 경계 — 종료일이 오늘인데 시작일 미전달(레거시 호출)이면 모집중 유지.
  //   endDate 는 @db.Date(UTC 자정). NOW(KST 19:00)의 당일이므로 recruiting 이어야 한다.
  //   (시각 단위 비교 시 KST 09:00 이후 종료로 오판되던 버그 회귀 방지.)
  it('scheduled + 종료일=오늘 + 시작일 미전달 → recruiting', () => {
    expect(mapTournamentUiStatus('scheduled', '2026-04-12T00:00:00Z', NOW)).toBe(
      'recruiting',
    );
  });

  // 날짜 기반 진행 중 보정 — classes-manage 대회 카드(resolvePeriodStatus)와 표기 일치.
  it('scheduled + 시작일 ≤ 오늘 ≤ 종료일 → in_progress (당일 대회 포함)', () => {
    expect(
      mapTournamentUiStatus(
        'scheduled',
        '2026-04-12T00:00:00Z',
        NOW,
        '2026-04-12T00:00:00Z',
      ),
    ).toBe('in_progress');
    expect(
      mapTournamentUiStatus(
        'scheduled',
        '2026-04-14T00:00:00Z',
        NOW,
        '2026-04-10T00:00:00Z',
      ),
    ).toBe('in_progress');
  });

  it('scheduled + 시작일 미래 → recruiting (신청 가능)', () => {
    expect(
      mapTournamentUiStatus(
        'scheduled',
        '2026-04-20T00:00:00Z',
        NOW,
        '2026-04-15T00:00:00Z',
      ),
    ).toBe('recruiting');
  });
});

// 일정 미정(기간 null) 대회 — C-1 재설계 회귀. 취소 가드는 시작일이 있어야만 발동한다.
describe('tournament.service — canCancelTournamentRegistration (일정 미정)', () => {
  const NOW = new Date('2026-04-12T10:00:00Z');

  it('startDate null/undefined(일정 미정) → 항상 취소 가능', () => {
    expect(canCancelTournamentRegistration(null, NOW)).toBe(true);
    expect(canCancelTournamentRegistration(undefined, NOW)).toBe(true);
  });

  it('시작일 당일(KST)부터 취소 불가, 전날까지 가능 — 기존 규칙 유지', () => {
    expect(
      canCancelTournamentRegistration('2026-04-12T00:00:00Z', NOW),
    ).toBe(false);
    expect(
      canCancelTournamentRegistration('2026-04-13T00:00:00Z', NOW),
    ).toBe(true);
  });
});

// 신청 선수 목록 판정 — 백엔드 assertTournamentTeamMembership(403) 을 결제 전에 선반영.
//   "참가 대상 전체"(selectedParticipantIds=[]) 대회에서 학부모의 모든 자녀가 노출되어
//   결제 버튼을 눌러야 403 을 보던 갭에 대한 회귀 테스트.
describe('tournament.service — buildTournamentChildOptions (주최 팀 멤버십)', () => {
  const TEAM = 'team-1';

  type TournamentArg = Parameters<typeof buildTournamentChildOptions>[0];

  const tournament = (
    overrides: Partial<TournamentDetail> = {},
  ): TournamentArg =>
    ({
      teamId: TEAM,
      selectedParticipantIds: [],
      paidParticipantIds: [],
      myRegistrations: [],
      eligibleBirthYears: null,
      eligibleBirthYearFrom: null,
      eligibleBirthYearTo: null,
      billingMode: 'PREPAID',
      ...overrides,
    }) as TournamentArg;

  const child = (
    id: string,
    approvalStatus: string | null,
    teamId: string | null = TEAM,
  ): TournamentChildInput => ({
    id,
    lastName: '김',
    firstName: id,
    birthDate: '2016-03-01',
    clubMemberships:
      approvalStatus === null ? [] : [{ teamId, approvalStatus }],
  });

  it('명단이 빈 대회에서도 주최 팀 승인 자녀만 신청 가능하다', () => {
    const options = buildTournamentChildOptions(tournament(), [
      child('approved', 'approved'),
      child('pending', 'pending'),
      child('other', 'approved', 'team-2'),
      child('none', null),
    ]);

    // 미소속·타 팀·반려 자녀는 목록에서 제외, 승인 대기는 사유 안내를 위해 남긴다.
    expect(options.map((o) => o.id)).toEqual(['approved', 'pending']);
    expect(options.filter(isTournamentChildApplicable).map((o) => o.id)).toEqual(
      ['approved'],
    );
    expect(options.find((o) => o.id === 'pending')?.teamMembership).toBe(
      'pending',
    );
  });

  it('반려(rejected) 자녀는 승인 대기와 달리 목록에서 제외된다', () => {
    const options = buildTournamentChildOptions(tournament(), [
      child('rejected', 'rejected'),
    ]);
    expect(options).toHaveLength(0);
  });

  it('주최 팀이 없는 대회(teamId null)는 멤버십을 검사하지 않는다 — 백엔드 조기 return 과 동일', () => {
    const options = buildTournamentChildOptions(
      tournament({ teamId: null }),
      [child('none', null)],
    );
    expect(options).toHaveLength(1);
    expect(options[0].teamMembership).toBe('not_required');
    expect(isTournamentChildApplicable(options[0])).toBe(true);
  });

  it('소속 정보가 없는 응답은 판정 불가로 보고 막지 않는다 (전원 숨김 방지)', () => {
    const options = buildTournamentChildOptions(tournament(), [
      { id: 'c1', lastName: '김', firstName: '하나', birthDate: '2016-03-01' },
    ]);
    expect(options).toHaveLength(1);
    expect(isTournamentChildApplicable(options[0])).toBe(true);
  });

  it('지정 명단 대회는 명단 + 승인 조건을 모두 만족해야 신청 가능하다', () => {
    const options = buildTournamentChildOptions(
      tournament({ selectedParticipantIds: ['approved', 'pending'] }),
      [
        child('approved', 'approved'),
        child('pending', 'pending'),
        child('outside', 'approved'),
      ],
    );
    expect(options.map((o) => o.id)).toEqual(['approved', 'pending']);
    expect(options.filter(isTournamentChildApplicable).map((o) => o.id)).toEqual(
      ['approved'],
    );
  });

  it('신청·결제한 자녀는 승인이 풀려도 목록에 남는다 (취소·후불결제 동선 보존)', () => {
    const options = buildTournamentChildOptions(
      tournament({
        paidParticipantIds: ['paid'],
        selectedParticipantIds: [],
      }),
      [child('paid', null)],
    );
    expect(options).toHaveLength(1);
    expect(options[0].isPaid).toBe(true);
  });
});
