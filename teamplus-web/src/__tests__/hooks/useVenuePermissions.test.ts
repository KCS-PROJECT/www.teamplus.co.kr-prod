import { computeVenuePermissions } from '@/hooks/useVenues';

describe('computeVenuePermissions (RBAC)', () => {
  it('ADMIN 은 모든 권한을 가진다', () => {
    const p = computeVenuePermissions('admin');
    expect(p).toEqual({
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canToggleStatus: true,
      canUploadImage: true,
      canViewManage: true,
    });
  });

  it('DIRECTOR 는 모든 권한을 가진다', () => {
    const p = computeVenuePermissions('director');
    expect(p.canDelete).toBe(true);
    expect(p.canCreate).toBe(true);
    expect(p.canUploadImage).toBe(true);
  });

  it('ACADEMY_DIRECTOR 는 DIRECTOR 와 동일한 전체 권한을 가진다', () => {
    const p = computeVenuePermissions('ACADEMY_DIRECTOR');
    expect(p.canDelete).toBe(true);
    expect(p.canCreate).toBe(true);
  });

  it('COACH 는 등록/수정/상태변경/이미지 업로드 가능, 삭제 불가', () => {
    const p = computeVenuePermissions('coach');
    expect(p.canCreate).toBe(true);
    expect(p.canUpdate).toBe(true);
    expect(p.canToggleStatus).toBe(true);
    expect(p.canUploadImage).toBe(true);
    expect(p.canDelete).toBe(false);
  });

  it('PARENT 는 모든 관리 권한이 차단된다 (조회 전용)', () => {
    const p = computeVenuePermissions('parent');
    expect(p.canCreate).toBe(false);
    expect(p.canUpdate).toBe(false);
    expect(p.canDelete).toBe(false);
    expect(p.canToggleStatus).toBe(false);
    expect(p.canUploadImage).toBe(false);
    expect(p.canViewManage).toBe(false);
  });

  it('TEEN / CHILD 는 조회 전용', () => {
    const teen = computeVenuePermissions('teen');
    const child = computeVenuePermissions('child');
    [teen, child].forEach((p) => {
      expect(p.canCreate).toBe(false);
      expect(p.canViewManage).toBe(false);
    });
  });

  it('null / undefined 사용자 타입은 모든 권한이 차단된다', () => {
    const p = computeVenuePermissions(null);
    expect(p.canCreate).toBe(false);
    const p2 = computeVenuePermissions(undefined);
    expect(p2.canCreate).toBe(false);
  });
});
