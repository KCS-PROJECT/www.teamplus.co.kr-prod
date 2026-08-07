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

  // day-level(KST) 경계 — 종료일이 오늘(당일 대회)이면 하루 종일 모집중 유지.
  //   endDate 는 @db.Date(UTC 자정). NOW(KST 19:00)의 당일이므로 recruiting 이어야 한다.
  //   (시각 단위 비교 시 KST 09:00 이후 종료로 오판되던 버그 회귀 방지.)
  it('scheduled + 종료일=오늘(당일 대회) → recruiting', () => {
    expect(mapTournamentUiStatus('scheduled', '2026-04-12T00:00:00Z', NOW)).toBe(
      'recruiting',
    );
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
