/**
 * RefundReconcileSheet 단위 테스트 (RTL, Portal 기반 BottomSheet).
 *
 * 검증: close/reopen 초기화 · 공백/500자 초과 memo 제출 차단 · outcome 필수 ·
 *       double submit 잠금(isProcessing) · onConfirm(outcome, trimmed memo) 인자.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RefundReconcileSheet } from '@/components/refunds/RefundReconcileSheet';
import { MESSAGES } from '@/lib/messages';

describe('RefundReconcileSheet', () => {
  afterEach(() => cleanup());

  const getConfirm = () =>
    screen.getByRole('button', {
      name: new RegExp(`${MESSAGES.refund.reconcileConfirm}|${MESSAGES.refund.reconcileProcessing}`),
    });
  const getMemo = () =>
    screen.getByPlaceholderText(MESSAGES.refund.reconcileMemoPlaceholder) as HTMLTextAreaElement;
  const getOutcomeCancelled = () =>
    screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileCancelled) });
  const getOutcomeNotCancelled = () =>
    screen.getByRole('radio', { name: new RegExp(MESSAGES.refund.reconcileNotCancelled) });

  it('isOpen=false 이면 렌더링되지 않는다', () => {
    render(
      <RefundReconcileSheet isOpen={false} onClose={jest.fn()} onConfirm={jest.fn()} isProcessing={false} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('outcome 미선택 또는 공백 memo 이면 확인 버튼이 비활성이다', () => {
    render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={jest.fn()} isProcessing={false} />,
    );
    // 초기: outcome null + memo 빈값 → 비활성
    expect(getConfirm()).toBeDisabled();
    // outcome 선택했으나 memo 공백만 → 비활성
    fireEvent.click(getOutcomeCancelled());
    fireEvent.change(getMemo(), { target: { value: '   ' } });
    expect(getConfirm()).toBeDisabled();
  });

  it('500자 초과 memo 는 제출 차단한다', () => {
    render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={jest.fn()} isProcessing={false} />,
    );
    fireEvent.click(getOutcomeCancelled());
    fireEvent.change(getMemo(), { target: { value: 'a'.repeat(501) } });
    expect(getConfirm()).toBeDisabled();
  });

  it('outcome + 유효 memo 이면 확인 시 onConfirm(outcome, trimmed memo) 호출', () => {
    const onConfirm = jest.fn();
    render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={onConfirm} isProcessing={false} />,
    );
    fireEvent.click(getOutcomeNotCancelled());
    fireEvent.change(getMemo(), { target: { value: '  PG 미취소 확인함  ' } });
    expect(getConfirm()).toBeEnabled();
    fireEvent.click(getConfirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('CONFIRMED_NOT_CANCELLED', 'PG 미취소 확인함');
  });

  it('같은 tick 연속 클릭에도 onConfirm 은 1회만 발화한다(동기 latch)', () => {
    const onConfirm = jest.fn();
    render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={onConfirm} isProcessing={false} />,
    );
    fireEvent.click(getOutcomeCancelled());
    fireEvent.change(getMemo(), { target: { value: '메모' } });
    const btn = getConfirm();
    // isProcessing 전파(재렌더) 전 동일 tick 연속 클릭.
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('isProcessing=true 이면 확인 버튼이 잠겨 double submit 이 차단된다', () => {
    const onConfirm = jest.fn();
    render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={onConfirm} isProcessing />,
    );
    fireEvent.click(getOutcomeCancelled());
    fireEvent.change(getMemo(), { target: { value: '메모' } });
    const btn = getConfirm();
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('outcome 은 네이티브 radio(동일 name 그룹)로 키보드 이동·선택이 보장된다', () => {
    const onConfirm = jest.fn();
    render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={onConfirm} isProcessing={false} />,
    );
    const cancelled = getOutcomeCancelled();
    const notCancelled = getOutcomeNotCancelled();
    // 네이티브 <input type="radio"> — 브라우저가 방향키 이동/스페이스 선택을 기본 제공.
    for (const el of [cancelled, notCancelled]) {
      expect(el.tagName).toBe('INPUT');
      expect(el).toHaveAttribute('type', 'radio');
    }
    // 동일 name 그룹 → roving tab stop + 방향키 그룹 이동(네이티브 라디오 그룹 시맨틱).
    expect(cancelled).toHaveAttribute('name', notCancelled.getAttribute('name'));
    expect(cancelled.getAttribute('name')).toBeTruthy();

    // 키보드 선택 등가(space/arrow) — 두 번째 라디오로 이동 선택 시 memo 와 함께 제출 가능.
    fireEvent.click(notCancelled);
    fireEvent.change(getMemo(), { target: { value: 'PG 미취소 확인' } });
    expect(getConfirm()).toBeEnabled();
    fireEvent.click(getConfirm());
    expect(onConfirm).toHaveBeenCalledWith('CONFIRMED_NOT_CANCELLED', 'PG 미취소 확인');
  });

  it('close 후 reopen 하면 outcome/memo 가 초기화된다', () => {
    const { rerender } = render(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={jest.fn()} isProcessing={false} />,
    );
    fireEvent.click(getOutcomeCancelled());
    fireEvent.change(getMemo(), { target: { value: '입력한 메모' } });
    expect(getConfirm()).toBeEnabled();

    // 닫기
    rerender(
      <RefundReconcileSheet isOpen={false} onClose={jest.fn()} onConfirm={jest.fn()} isProcessing={false} />,
    );
    // 재오픈 — 이전 입력이 남지 않아 확인 버튼이 다시 비활성
    rerender(
      <RefundReconcileSheet isOpen onClose={jest.fn()} onConfirm={jest.fn()} isProcessing={false} />,
    );
    expect(getMemo().value).toBe('');
    expect(getConfirm()).toBeDisabled();
  });
});
