/**
 * child-status — 대표 팀 기준 묶음(groupByRepresentativeTeam / groupChildrenByTeam) 계약 고정.
 *
 *  · 다중 소속 항목은 대표 팀 그룹에만 1회 배치
 *  · 그룹 순서 = 입력에서 대표 팀이 처음 등장한 순서 (입력 재정렬 없음)
 *  · 무소속 그룹은 항상 마지막
 *  · 그룹 내 순서 = 입력 순서
 *  · 입력 불변
 */

import type { Child } from '@/components/children/ChildCard';
import {
  compareChildDisplayOrder,
  getRepresentativeTeam,
  groupByRepresentativeTeam,
  groupChildrenByTeam,
} from '@/lib/child-status';

function child(partial: Partial<Child> & { id: string; name: string }): Child {
  return {
    age: 0,
    club: null,
    isActive: true,
    imageUrl: null,
    ...partial,
  };
}

const TEAM_A = { id: 'team-a', name: 'A팀', logoUrl: 'https://cdn/a.png' };
const TEAM_B = { id: 'team-b', name: 'B팀', logoUrl: null };

describe('groupByRepresentativeTeam', () => {
  it('groups by first appearance and keeps input order inside each group', () => {
    const items = [
      { id: '1', teamId: 'a', teamName: 'A' },
      { id: '2', teamId: 'b', teamName: 'B' },
      { id: '3', teamId: 'a', teamName: 'A' },
    ];
    const groups = groupByRepresentativeTeam(items);
    expect(groups.map((g) => g.teamId)).toEqual(['a', 'b']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['1', '3']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['2']);
  });

  it('places the no-team group last even when it appears first in input', () => {
    const items = [
      { id: 'x', teamId: null },
      { id: '1', teamId: 'a', teamName: 'A' },
      { id: 'y', teamId: null },
    ];
    const groups = groupByRepresentativeTeam(items);
    expect(groups.map((g) => g.teamId)).toEqual(['a', null]);
    expect(groups[1].items.map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('omits the no-team group when every item has a team', () => {
    const groups = groupByRepresentativeTeam([{ id: '1', teamId: 'a' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teamId).toBe('a');
  });

  it('returns a single no-team group when nobody has a team', () => {
    const groups = groupByRepresentativeTeam([
      { id: '1', teamId: null },
      { id: '2', teamId: null },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teamId).toBeNull();
    expect(groups[0].items).toHaveLength(2);
  });

  it('takes team name and logo from the first item of the group', () => {
    const groups = groupByRepresentativeTeam([
      { id: '1', teamId: 'a', teamName: 'A', logoUrl: 'a.png' },
      { id: '2', teamId: 'a', teamName: 'A(dup)', logoUrl: 'other.png' },
    ]);
    expect(groups[0].teamName).toBe('A');
    expect(groups[0].logoUrl).toBe('a.png');
  });

  it('does not mutate the input array or its items', () => {
    const items = [
      { id: '1', teamId: 'a' },
      { id: 'x', teamId: null },
      { id: '2', teamId: 'b' },
    ];
    const snapshot = JSON.stringify(items);
    groupByRepresentativeTeam(items);
    expect(JSON.stringify(items)).toBe(snapshot);
    expect(items.map((i) => i.id)).toEqual(['1', 'x', '2']);
  });

  it('returns an empty array for empty input', () => {
    expect(groupByRepresentativeTeam([])).toEqual([]);
  });
});

describe('getRepresentativeTeam', () => {
  it('prefers teams[0]', () => {
    const c = child({ id: '1', name: '민준', teams: [TEAM_A, TEAM_B], clubIds: ['team-a', 'team-b'], club: 'A팀' });
    expect(getRepresentativeTeam(c)).toEqual(TEAM_A);
  });

  it('falls back to clubIds[0] + club + teamLogoUrl when teams is absent', () => {
    const c = child({ id: '1', name: '민준', clubIds: ['team-a'], club: 'A팀', teamLogoUrl: 'legacy.png' });
    expect(getRepresentativeTeam(c)).toEqual({ id: 'team-a', name: 'A팀', logoUrl: 'legacy.png' });
  });

  it('returns null for a child without any approved team', () => {
    expect(getRepresentativeTeam(child({ id: '1', name: '도윤' }))).toBeNull();
  });
});

describe('groupChildrenByTeam', () => {
  it('places a multi-team child only in its representative team group', () => {
    const jiwoo = child({ id: 'jiwoo', name: '지우', teams: [TEAM_B, TEAM_A], clubIds: ['team-b', 'team-a'], club: 'B팀' });
    const minjun = child({ id: 'minjun', name: '민준', teams: [TEAM_A], clubIds: ['team-a'], club: 'A팀' });
    const groups = groupChildrenByTeam([minjun, jiwoo]);
    expect(groups.map((g) => g.teamId)).toEqual(['team-a', 'team-b']);
    expect(groups[0].items.map((c) => c.id)).toEqual(['minjun']);
    expect(groups[1].items.map((c) => c.id)).toEqual(['jiwoo']);
    // 두 그룹에 중복 배치되지 않는다
    const all = groups.flatMap((g) => g.items.map((c) => c.id));
    expect(all).toEqual(['minjun', 'jiwoo']);
  });

  it('keeps the default-selected child (sorted first) as the first row of the first group', () => {
    const unsorted = [
      child({ id: 'no-team', name: '도윤', birthDate: '2012-01-01' }),
      child({ id: 'b-old', name: '서연', birthDate: '2014-01-01', teams: [TEAM_B], clubIds: ['team-b'], club: 'B팀' }),
      child({ id: 'a-young', name: '민준', birthDate: '2016-01-01', teams: [TEAM_A], clubIds: ['team-a'], club: 'A팀' }),
    ];
    const sorted = [...unsorted].sort(compareChildDisplayOrder);
    expect(sorted[0].id).toBe('b-old');
    const groups = groupChildrenByTeam(sorted);
    expect(groups[0].teamId).toBe('team-b');
    expect(groups[0].items[0].id).toBe('b-old');
    expect(groups[groups.length - 1].teamId).toBeNull();
  });
});
