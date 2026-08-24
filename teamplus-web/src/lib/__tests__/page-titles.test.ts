/**
 * resolvePageTitle — 정확 일치 우선 + prefix 매칭 확장 회귀 테스트.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-5
 * 계약: 정적 키가 항상 우선하고, prefix 는 `prefix + '/'` 로 시작하는 경로에만 적용된다.
 */

import { PAGE_TITLES, resolvePageTitle } from '../page-titles';

describe('resolvePageTitle', () => {
  it('정적 키 정확 일치를 반환한다 (기존 동작 회귀 없음)', () => {
    expect(resolvePageTitle('/parent')).toBe('홈');
    expect(resolvePageTitle('/classes-manage/create')).toBe('훈련 등록');
    expect(resolvePageTitle('/contents')).toBe('포스트');
  });

  it('trailing slash 를 제거하고 일치시킨다', () => {
    expect(resolvePageTitle('/contents/')).toBe('포스트');
  });

  it('동적 상세 경로는 prefix 매칭으로 해석한다', () => {
    expect(resolvePageTitle('/contents/my-first-post')).toBe('포스트');
    expect(resolvePageTitle('/contents/6-01fab125/')).toBe('포스트');
    expect(
      resolvePageTitle(`/contents/${encodeURIComponent('아이스하키-입문')}`),
    ).toBe('포스트');
  });

  it('prefix 와 유사하지만 다른 경로는 매칭하지 않는다', () => {
    expect(resolvePageTitle('/contents-archive')).toBeUndefined();
    expect(resolvePageTitle('/content')).toBeUndefined();
  });

  it('미등록 경로는 undefined (호출처 fallback)', () => {
    expect(resolvePageTitle('/no-such-page')).toBeUndefined();
    expect(resolvePageTitle('')).toBeUndefined();
  });

  it('정적 키와 prefix 가 겹치면 정적 키가 우선한다', () => {
    // '/contents' 자체는 PAGE_TITLES 정적 키로 해석 — prefix 테이블 조회 없이 동일 값.
    expect(PAGE_TITLES['/contents']).toBe('포스트');
    expect(resolvePageTitle('/contents')).toBe(PAGE_TITLES['/contents']);
  });
});
