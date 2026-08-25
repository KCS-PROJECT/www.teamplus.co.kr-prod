/**
 * useChildren — 목록 조회 실패({success:false})가 error 상태로 승격되는지 통합 회귀 테스트
 * (Codex R2 — R1 #3 실제 훅 경로 검증).
 *
 * api-client 는 서버/네트워크 오류를 throw 가 아니라 {success:false, error} 로 정규화하므로,
 * 이를 빈 배열로 삼키면 홈 판정(parent-home-visibility)이 "자녀 0명 확정"으로 오인한다.
 */

import { renderHook, waitFor } from '@testing-library/react';

const mockGet = jest.fn();

jest.mock('@/services/api-client', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'p1', userType: 'parent' },
    isLoading: false,
  }),
}));

import { useChildren } from '../useChildren';

describe('useChildren — 목록 조회 실패와 0명 확정의 구분', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('{success:false} 응답 → error 설정 (빈 배열로 삼키지 않음)', async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: { code: 'SERVER_ERROR', message: '서버 오류', statusCode: 500 },
    });
    const { result } = renderHook(() => useChildren());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.children).toEqual([]);
  });

  it('성공 + 빈 목록 → error 없음 (자녀 0명 확정)', async () => {
    mockGet.mockResolvedValue({ success: true, data: { data: [], total: 0 } });
    const { result } = renderHook(() => useChildren());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.children).toEqual([]);
  });
});
