/**
 * 학부모 홈 노출 판정 — "조회 실패 ≠ 빈 상태" 원칙 회귀 테스트 (Codex R1-3).
 * SoT: src/lib/parent-home-visibility.ts
 */

import {
  resolveReadingPlacement,
  resolveShowBrowseCta,
} from '../parent-home-visibility';

const base = {
  isChildrenLoading: false,
  hasChildrenError: false,
  childCount: 1,
  teamsResolved: true,
  teamsError: false,
  childTeamCount: 1,
};

describe('resolveShowBrowseCta — 수업 둘러보기 CTA', () => {
  it('자녀 0명 "확정"(성공 응답 빈 배열)에서만 숨긴다', () => {
    expect(resolveShowBrowseCta({ ...base, childCount: 0 })).toBe(false);
  });

  it('로딩 중에는 낙관적으로 노출한다', () => {
    expect(
      resolveShowBrowseCta({ ...base, isChildrenLoading: true, childCount: 0 }),
    ).toBe(true);
  });

  it('조회 실패는 0명 확정이 아니다 — 노출 유지', () => {
    expect(
      resolveShowBrowseCta({ ...base, hasChildrenError: true, childCount: 0 }),
    ).toBe(true);
  });

  it('자녀가 있으면 노출한다', () => {
    expect(resolveShowBrowseCta(base)).toBe(true);
  });
});

describe('resolveReadingPlacement — 포스트 배치', () => {
  it('자녀·팀 조회 확정 전에는 렌더하지 않는다(null)', () => {
    expect(
      resolveReadingPlacement({ ...base, isChildrenLoading: true }),
    ).toBeNull();
    expect(resolveReadingPlacement({ ...base, teamsResolved: false })).toBeNull();
  });

  it('자녀 조회 실패는 승격하지 않고 기본 위치(footer)', () => {
    expect(
      resolveReadingPlacement({ ...base, hasChildrenError: true, childCount: 0 }),
    ).toBe('footer');
  });

  it('자녀 0명 확정이면 승격(promoted)', () => {
    expect(resolveReadingPlacement({ ...base, childCount: 0 })).toBe('promoted');
  });

  it('팀 조회 실패·미확정은 무소속 확정이 아니다 — footer', () => {
    expect(
      resolveReadingPlacement({ ...base, teamsError: true, childTeamCount: 0 }),
    ).toBe('footer');
    expect(resolveReadingPlacement({ ...base, childTeamCount: null })).toBe(
      'footer',
    );
  });

  it('자녀 팀 0개 확정이면 승격, 있으면 footer', () => {
    expect(resolveReadingPlacement({ ...base, childTeamCount: 0 })).toBe(
      'promoted',
    );
    expect(resolveReadingPlacement(base)).toBe('footer');
  });
});
