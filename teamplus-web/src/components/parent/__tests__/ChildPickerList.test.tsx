/**
 * ChildPickerList — 홈 시트·사이드 메뉴 모달 공용 자녀 목록 계약 고정.
 *
 *  · 그룹 1개면 헤더 없음(기존 단순 목록과 동일) · 2개 이상이면 그룹 헤더 노출
 *  · 다중 소속 부제 "대표팀 · 나머지팀" · 무소속 라벨
 *  · aria-pressed 선택 표시 · 행 탭 시 onSelect(id)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { Child } from '@/components/children/ChildCard';
import {
  ChildPickerList,
  toChildPickerItem,
  type ChildPickerListItem,
} from '@/components/parent/ChildPickerList';
import { MESSAGES } from '@/lib/messages';

function item(partial: Partial<ChildPickerListItem> & { id: string; name: string }): ChildPickerListItem {
  return {
    teamId: null,
    teamName: null,
    logoUrl: null,
    otherTeamNames: [],
    ...partial,
  };
}

const A = { teamId: 'team-a', teamName: '서울아이스하키클럽' };
const B = { teamId: 'team-b', teamName: '강남오픈클래스' };

describe('ChildPickerList', () => {
  it('renders no group header when every child shares one team', () => {
    render(
      <ChildPickerList
        items={[item({ id: '1', name: '민준', ...A }), item({ id: '2', name: '서연', ...A })]}
        selectedChildId="1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryAllByTestId('child-picker-group-header')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders no group header when every child has no team', () => {
    render(
      <ChildPickerList
        items={[item({ id: '1', name: '도윤' }), item({ id: '2', name: '하준' })]}
        selectedChildId="1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryAllByTestId('child-picker-group-header')).toHaveLength(0);
    expect(screen.getAllByText(MESSAGES.team.childHeaderNoTeamLabel)).toHaveLength(2);
  });

  it('renders a header per group with the no-team group last', () => {
    render(
      <ChildPickerList
        items={[
          item({ id: '1', name: '민준', ...A }),
          item({ id: '3', name: '지우', ...B }),
          item({ id: '4', name: '도윤' }),
        ]}
        selectedChildId="1"
        onSelect={jest.fn()}
      />,
    );
    const headers = screen.getAllByTestId('child-picker-group-header');
    expect(headers.map((h) => h.textContent)).toEqual([
      A.teamName,
      B.teamName,
      MESSAGES.team.childPickerNoTeamGroup,
    ]);
  });

  it('shows all memberships in the subtitle for a multi-team child', () => {
    render(
      <ChildPickerList
        items={[
          item({ id: '1', name: '민준', ...A }),
          item({ id: '3', name: '지우', ...B, otherTeamNames: [A.teamName] }),
        ]}
        selectedChildId="1"
        onSelect={jest.fn()}
      />,
    );
    expect(
      screen.getByText(MESSAGES.team.childPickerTeams([B.teamName, A.teamName])),
    ).toBeInTheDocument();
  });

  it('marks the selected child with aria-pressed and calls onSelect on tap', () => {
    const onSelect = jest.fn();
    render(
      <ChildPickerList
        items={[item({ id: '1', name: '민준', ...A }), item({ id: '2', name: '서연', ...A })]}
        selectedChildId="1"
        onSelect={onSelect}
      />,
    );
    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith('2');
  });
});

describe('toChildPickerItem', () => {
  const base: Child = { id: 'c', name: '지우', age: 0, club: null, isActive: true, imageUrl: null };

  it('maps representative team and other memberships', () => {
    const result = toChildPickerItem({
      ...base,
      club: 'B팀',
      clubIds: ['team-b', 'team-a'],
      teamLogoUrl: 'b.png',
      teams: [
        { id: 'team-b', name: 'B팀', logoUrl: 'b.png' },
        { id: 'team-a', name: 'A팀', logoUrl: null },
      ],
    });
    expect(result).toEqual({
      id: 'c',
      name: '지우',
      teamId: 'team-b',
      teamName: 'B팀',
      logoUrl: 'b.png',
      otherTeamNames: ['A팀'],
    });
  });

  it('uses the logo override when provided, including null', () => {
    const withTeams = { ...base, teams: [{ id: 'team-a', name: 'A팀', logoUrl: 'a.png' }] };
    expect(toChildPickerItem(withTeams, 'override.png').logoUrl).toBe('override.png');
    expect(toChildPickerItem(withTeams, null).logoUrl).toBeNull();
    expect(toChildPickerItem(withTeams).logoUrl).toBe('a.png');
  });

  it('maps a child without a team to the no-team item', () => {
    expect(toChildPickerItem(base)).toEqual({
      id: 'c',
      name: '지우',
      teamId: null,
      teamName: null,
      logoUrl: null,
      otherTeamNames: [],
    });
  });
});
