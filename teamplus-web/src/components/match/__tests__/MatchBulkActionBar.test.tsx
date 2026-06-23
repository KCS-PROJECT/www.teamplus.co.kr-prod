/**
 * MatchBulkActionBar 컴포넌트 단위 테스트.
 *
 * Phase 4-B — 신청자 일괄 처리 툴바의 선택 상태, 버튼 활성화, 콜백 호출을 검증합니다.
 *
 * 검증 대상:
 * - 선택 카운트 표시 (selectedCount / totalCount)
 * - 선택 0명 시 일괄 승인/거절 버튼 비활성화
 * - 전체 선택 · 일괄 승인 · 일괄 거절 콜백 호출
 * - isProcessing 로딩 상태 → 전체 비활성화
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MatchBulkActionBar } from '@/components/match/MatchBulkActionBar';

describe('MatchBulkActionBar', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * 공통 기본 props — 각 테스트에서 필요한 부분만 override 합니다.
   */
  const baseProps = {
    selectedCount: 0,
    totalCount: 10,
    onSelectAll: jest.fn(),
    onBulkApprove: jest.fn(),
    onBulkReject: jest.fn(),
  };

  const getApproveButton = () =>
    screen.getByRole('button', { name: /일괄 승인/ });

  const getRejectButton = () =>
    screen.getByRole('button', { name: /일괄 거절/ });

  describe('선택 상태 표시', () => {
    it('selectedCount=0 이면 "전체 선택" 라벨을 노출한다', () => {
      render(<MatchBulkActionBar {...baseProps} selectedCount={0} />);
      expect(screen.getByText('전체 선택')).toBeInTheDocument();
    });

    it('selectedCount=5 이면 "5명 선택됨" 라벨을 노출한다', () => {
      render(<MatchBulkActionBar {...baseProps} selectedCount={5} totalCount={10} />);
      expect(screen.getByText('5명 선택됨')).toBeInTheDocument();
    });
  });

  describe('버튼 활성화 로직', () => {
    it('selectedCount=0 이면 일괄 승인/거절 버튼이 모두 비활성화된다', () => {
      render(<MatchBulkActionBar {...baseProps} selectedCount={0} />);

      expect(getApproveButton()).toBeDisabled();
      expect(getRejectButton()).toBeDisabled();
    });

    it('selectedCount>0 이면 일괄 승인/거절 버튼이 활성화된다', () => {
      render(<MatchBulkActionBar {...baseProps} selectedCount={3} />);

      expect(getApproveButton()).toBeEnabled();
      expect(getRejectButton()).toBeEnabled();
    });

    it('totalCount=0 이면 전체 선택 버튼이 비활성화된다', () => {
      render(<MatchBulkActionBar {...baseProps} selectedCount={0} totalCount={0} />);
      // 첫 번째 버튼이 전체 선택 버튼입니다.
      const selectAllButton = screen.getByRole('button', { pressed: false });
      expect(selectAllButton).toBeDisabled();
    });
  });

  describe('콜백 호출', () => {
    it('전체 선택 버튼 클릭 시 onSelectAll 이 호출된다', () => {
      const onSelectAll = jest.fn();
      render(
        <MatchBulkActionBar
          {...baseProps}
          selectedCount={0}
          totalCount={10}
          onSelectAll={onSelectAll}
        />
      );

      const selectAllButton = screen.getByText('전체 선택').closest('button')!;
      fireEvent.click(selectAllButton);

      expect(onSelectAll).toHaveBeenCalledTimes(1);
    });

    it('일괄 승인 버튼 클릭 시 onBulkApprove 가 호출된다', () => {
      const onBulkApprove = jest.fn();
      render(
        <MatchBulkActionBar
          {...baseProps}
          selectedCount={2}
          onBulkApprove={onBulkApprove}
        />
      );

      fireEvent.click(getApproveButton());
      expect(onBulkApprove).toHaveBeenCalledTimes(1);
    });

    it('일괄 거절 버튼 클릭 시 onBulkReject 가 호출된다', () => {
      const onBulkReject = jest.fn();
      render(
        <MatchBulkActionBar
          {...baseProps}
          selectedCount={2}
          onBulkReject={onBulkReject}
        />
      );

      fireEvent.click(getRejectButton());
      expect(onBulkReject).toHaveBeenCalledTimes(1);
    });
  });

  describe('로딩 상태', () => {
    it('isProcessing=true 이면 모든 버튼이 비활성화된다', () => {
      render(
        <MatchBulkActionBar
          {...baseProps}
          selectedCount={3}
          isProcessing={true}
        />
      );

      expect(getApproveButton()).toBeDisabled();
      expect(getRejectButton()).toBeDisabled();

      const selectAllButton = screen.getByText('3명 선택됨').closest('button')!;
      expect(selectAllButton).toBeDisabled();
    });
  });

  describe('전체 선택 상태 표시', () => {
    it('selectedCount === totalCount 이면 aria-pressed=true', () => {
      render(
        <MatchBulkActionBar
          {...baseProps}
          selectedCount={10}
          totalCount={10}
        />
      );

      const selectAllButton = screen.getByRole('button', { pressed: true });
      expect(selectAllButton).toBeInTheDocument();
    });
  });
});
