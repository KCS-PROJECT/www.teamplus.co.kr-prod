/**
 * useRouteParams 훅 테스트
 *
 * 검증 범위:
 *  - navId: URL `_nav` 쿼리에서 추출
 *  - forward: 송신 화면이 push 한 데이터 읽기
 *  - sendBack: 큐잉 동작
 *  - hasForward: forward 존재 여부 truthy 가드
 *  - typed nav 미진입 시(=navId null) 모든 필드 안전 처리
 */

import { renderHook, act } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import {
  __debug_resetAll,
  getNavEntry,
  pushNavEntry,
} from '@/lib/typed-navigation';
import { useRouteParams } from '../useRouteParams';

// 매 테스트마다 useSearchParams 가 반환하는 값을 제어하기 위해 모듈 모킹.
// jest.setup.js 의 기본 모킹이 있으나, 본 테스트는 nav id 를 동적으로 변경해야 함.
jest.mock('next/navigation', () => ({
  ...jest.requireActual<object>('next/navigation'),
  useSearchParams: jest.fn(),
}));

const mockedUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;

function setSearchParams(query: string) {
  const params = new URLSearchParams(query);
  // ReadonlyURLSearchParams 와 시그니처 호환되도록 Object.create 로 캐스팅
  mockedUseSearchParams.mockReturnValue(
    params as unknown as ReturnType<typeof useSearchParams>,
  );
}

describe('useRouteParams', () => {
  beforeEach(() => {
    __debug_resetAll();
    mockedUseSearchParams.mockReset();
  });

  describe('navId 추출', () => {
    it('_nav 쿼리에서 id 를 읽어 반환', () => {
      setSearchParams('_nav=abc123');
      const { result } = renderHook(() => useRouteParams());
      expect(result.current.navId).toBe('abc123');
    });

    it('_nav 가 없으면 navId 는 null', () => {
      setSearchParams('foo=bar');
      const { result } = renderHook(() => useRouteParams());
      expect(result.current.navId).toBeNull();
    });
  });

  describe('forward 읽기', () => {
    it('typed nav 로 진입한 화면은 forward 데이터를 읽는다', () => {
      const id = pushNavEntry({ forward: { highlight: 'roster' } });
      setSearchParams(`_nav=${id}`);

      const { result } = renderHook(() =>
        useRouteParams<{ highlight: string }>(),
      );

      expect(result.current.forward).toEqual({ highlight: 'roster' });
      expect(result.current.hasForward).toBe(true);
    });

    it('forward 가 없는 엔트리는 undefined 반환', () => {
      const id = pushNavEntry({});
      setSearchParams(`_nav=${id}`);

      const { result } = renderHook(() => useRouteParams());

      expect(result.current.forward).toBeUndefined();
      expect(result.current.hasForward).toBe(false);
    });

    it('navId 가 null 이면 forward 는 undefined', () => {
      setSearchParams('');
      const { result } = renderHook(() => useRouteParams());
      expect(result.current.forward).toBeUndefined();
      expect(result.current.hasForward).toBe(false);
    });

    it('스택에 미존재하는 navId 면 forward 는 undefined (구독 해제된 케이스)', () => {
      setSearchParams('_nav=ghost-id');
      const { result } = renderHook(() => useRouteParams());
      expect(result.current.forward).toBeUndefined();
    });
  });

  describe('sendBack', () => {
    it('해당 엔트리의 pendingBackward 를 큐잉', () => {
      const id = pushNavEntry({ forward: { x: 1 } });
      setSearchParams(`_nav=${id}`);

      const { result } = renderHook(() =>
        useRouteParams<{ x: number }, { applied: boolean }>(),
      );

      act(() => {
        result.current.sendBack({ applied: true });
      });

      const entry = getNavEntry(id);
      expect(entry?.pendingBackward).toEqual({ applied: true });
    });

    it('마지막 호출 값으로 덮어쓴다', () => {
      const id = pushNavEntry({});
      setSearchParams(`_nav=${id}`);

      const { result } = renderHook(() =>
        useRouteParams<unknown, { v: number }>(),
      );

      act(() => {
        result.current.sendBack({ v: 1 });
        result.current.sendBack({ v: 2 });
      });

      expect(getNavEntry(id)?.pendingBackward).toEqual({ v: 2 });
    });

    it('navId 가 null 이어도 호출 시 예외 없음 (no-op)', () => {
      setSearchParams('');
      const { result } = renderHook(() => useRouteParams<unknown, unknown>());

      expect(() => {
        act(() => {
          result.current.sendBack({ ignored: true });
        });
      }).not.toThrow();
    });
  });

  describe('제네릭 타입 추론', () => {
    interface Forward {
      stepId: string;
      meta?: { author: string };
    }
    interface Backward {
      success: boolean;
    }

    it('TForward/TBackward 제네릭이 sendBack/forward 타입에 반영된다', () => {
      const id = pushNavEntry({
        forward: { stepId: 's1', meta: { author: 'A' } } as Forward,
      });
      setSearchParams(`_nav=${id}`);

      const { result } = renderHook(() => useRouteParams<Forward, Backward>());

      // 타입 사용 — TS 컴파일 타임 검증
      const meta = result.current.forward?.meta;
      expect(meta?.author).toBe('A');

      act(() => {
        result.current.sendBack({ success: true });
      });

      const stored = getNavEntry(id)?.pendingBackward as Backward;
      expect(stored.success).toBe(true);
    });
  });
});
