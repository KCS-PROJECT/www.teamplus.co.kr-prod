import {
  ALL_PROTECTED_PATHS,
  getDashboardPathByUserType,
  getProtectedPathsByUserType,
  normalizeUserType,
} from '@/lib/auth-routing';

describe('auth-routing', () => {
  describe('normalizeUserType()', () => {
    it('대문자 역할을 소문자로 정규화한다', () => {
      expect(normalizeUserType('TEEN')).toBe('teen');
      expect(normalizeUserType('ADMIN')).toBe('admin');
    });

    it('알 수 없는 역할은 null을 반환한다', () => {
      expect(normalizeUserType('manager')).toBeNull();
      expect(normalizeUserType('')).toBeNull();
      expect(normalizeUserType(undefined)).toBeNull();
    });
  });

  describe('getDashboardPathByUserType()', () => {
    it('teen 계정은 항상 /teen 으로 이동한다', () => {
      expect(getDashboardPathByUserType('teen')).toBe('/teen');
      expect(getDashboardPathByUserType('TEEN')).toBe('/teen');
    });

    it('알 수 없는 역할은 fallback 경로를 반환한다', () => {
      expect(getDashboardPathByUserType('manager', '/')).toBe('/');
    });
  });

  describe('getProtectedPathsByUserType()', () => {
    it('admin은 모든 대시보드 경로에 접근 가능하다', () => {
      expect(getProtectedPathsByUserType('ADMIN')).toEqual(
        expect.arrayContaining(['/admin', '/parent', '/coach', '/director', '/child', '/teen']),
      );
    });

    it('teen은 teen 경로만 가진다', () => {
      expect(getProtectedPathsByUserType('TEEN')).toEqual(['/teen']);
    });
  });

  it('보호 경로 목록에 teen 경로가 포함된다', () => {
    expect(ALL_PROTECTED_PATHS).toContain('/teen');
  });
});
