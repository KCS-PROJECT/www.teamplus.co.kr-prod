/**
 * ToastProvider 중복 표시 방지(dedup) 회귀 테스트
 *
 * 2026-06-07: "한 동작당 토스트 1개" 사용자 지시에 따른 addToast dedup 가드 검증.
 * - 같은 메시지를 짧은 시간(window) 안에 두 번 호출 → 한 번만 표시 (더블클릭 / StrictMode / 전역+로컬 동시 호출)
 * - 서로 다른 메시지 → 모두 표시 (정상 토스트를 지우지 않음)
 * - window 경과 후 같은 메시지 → 다시 표시 (의도적 연속 동작은 막지 않음)
 */

import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/ui/Toast';

type ToastApi = ReturnType<typeof useToast>['toast'];

let toastApi: ToastApi;

function Capture() {
  toastApi = useToast().toast;
  return null;
}

function renderProvider() {
  return render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}

describe('ToastProvider dedup 가드', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('같은 메시지를 짧은 시간에 두 번 호출하면 한 번만 표시한다', () => {
    renderProvider();

    act(() => {
      toastApi.success('저장되었습니다.');
      toastApi.success('저장되었습니다.');
    });

    expect(screen.getAllByText('저장되었습니다.')).toHaveLength(1);
  });

  it('variant 가 같아도 title 이 다르면 각각 표시한다', () => {
    renderProvider();

    act(() => {
      toastApi.success('저장되었습니다.');
      toastApi.success('등록되었습니다.');
    });

    expect(screen.getByText('저장되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('등록되었습니다.')).toBeInTheDocument();
  });

  it('서로 다른 토스트(성공 + 오류)는 동시에 둘 다 표시한다', () => {
    renderProvider();

    act(() => {
      toastApi.success('저장되었습니다.');
      toastApi.error('네트워크 연결을 확인해주세요.');
    });

    expect(screen.getByText('저장되었습니다.')).toBeInTheDocument();
    expect(screen.getByText('네트워크 연결을 확인해주세요.')).toBeInTheDocument();
  });

  it('dedup window 경과 후 같은 메시지를 호출하면 다시 표시한다', () => {
    renderProvider();

    act(() => {
      toastApi.success('저장되었습니다.');
    });
    act(() => {
      jest.advanceTimersByTime(1100); // TOAST_DEDUP_WINDOW_MS(1000ms) 초과
    });
    act(() => {
      toastApi.success('저장되었습니다.');
    });

    expect(screen.getAllByText('저장되었습니다.')).toHaveLength(2);
  });
});
