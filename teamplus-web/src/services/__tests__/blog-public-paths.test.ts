/**
 * 포스트(Blog) 공개 API 화이트리스트 회귀 테스트.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-6
 *
 * 계약: /blog 목록·slug 상세·조회수 비콘은 public 판정, /blog/admin/* 는 절대 public 판정 금지.
 * 공개 분류는 클라이언트가 인증 토큰 첨부를 생략해도 된다는 뜻이며 backend 권한을 바꾸지 않는다.
 */

import { isPublicApiPath } from '../api-lifecycle';

describe('blog public API paths', () => {
  describe('public 판정되어야 하는 경로', () => {
    it.each([
      '/blog',
      '/blog?page=1&pageSize=12',
      '/blog?category=GUIDE&page=1&pageSize=12',
      '/api/v1/blog',
      '/api/v1/blog?category=NEWS',
      '/blog/my-first-post',
      '/blog/my-first-post?ref=dashboard',
      '/api/v1/blog/6-01fab125',
      '/blog/my-first-post/view',
      '/api/v1/blog/2026-dfd00a2c/view',
      // 한글 등 non-ASCII slug 는 encodeURIComponent 후 호출된다
      `/blog/${encodeURIComponent('아이스하키-입문')}`,
      `/blog/${encodeURIComponent('아이스하키-입문')}/view`,
    ])('%s → public', (path) => {
      expect(isPublicApiPath(path)).toBe(true);
    });
  });

  describe('public 판정되면 안 되는 경로 (admin 관리 계열)', () => {
    it.each([
      '/blog/admin',
      '/blog/admin/list',
      '/blog/admin/list?page=1',
      '/blog/admin/some-id',
      '/api/v1/blog/admin/list',
      '/api/v1/blog/admin/cku123',
    ])('%s → NOT public', (path) => {
      expect(isPublicApiPath(path)).toBe(false);
    });
  });

  describe('무관 경로 오염 없음', () => {
    it.each(['/blogs', '/my-blog', '/classes', '/notices'])(
      '%s → NOT public (blog 패턴 미매칭)',
      (path) => {
        expect(isPublicApiPath(path)).toBe(false);
      },
    );
  });
});
