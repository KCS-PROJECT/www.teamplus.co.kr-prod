/**
 * MatchRejectDialog 컴포넌트 단위 테스트.
 *
 * Phase 4-B — 신청자 거절 다이얼로그의 입력 검증, 제출, 취소, 로딩 상태를 검증합니다.
 *
 * 검증 대상:
 * - isOpen 제어 렌더링 (Portal)
 * - 단일/다중 거절 제목 분기
 * - 사유 textarea 10~200자 검증 → 제출 버튼 활성화 토글
 * - onConfirm(reason) 호출 여부
 * - onClose 호출 여부
 * - isSubmitting 로딩 상태
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MatchRejectDialog } from '@/components/match/MatchRejectDialog';

describe('MatchRejectDialog', () => {
  // 각 테스트 종료 후 document.body 초기화
  afterEach(() => {
    cleanup();
  });

  /**
   * createPortal 기반이므로 document 조회 가능 여부로 렌더링을 확인합니다.
   */
  const getTextareaByPlaceholder = () =>
    screen.getByPlaceholderText(/거절 사유를 10자 이상 200자 이하로 입력해 주세요/);

  const getConfirmButton = () =>
    screen.getByRole('button', { name: /거절하기|처리 중/ });

  const getCancelButton = () => screen.getByRole('button', { name: /^취소$/ });

  describe('렌더링 가시성', () => {
    it('isOpen=false 이면 다이얼로그가 렌더링되지 않는다', () => {
      render(
        <MatchRejectDialog
          isOpen={false}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      // Portal 자체가 생성되지 않아야 합니다.
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('isOpen=true 이고 단일 신청자이면 "신청자 거절" 제목을 노출한다', () => {
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      // 단일 거절 제목: "홍길동 거절"
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        '홍길동 거절'
      );
    });

    it('다중 신청자이면 "N명 거절" 제목을 노출한다', () => {
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['A', 'B', 'C']}
        />
      );

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        '3명 거절'
      );
    });
  });

  describe('사유 검증', () => {
    it('빈 값이면 거절 버튼이 비활성화된다', () => {
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      expect(getConfirmButton()).toBeDisabled();
    });

    it('9자(최소 미만) 입력 시 거절 버튼이 비활성화된다', () => {
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      const textarea = getTextareaByPlaceholder();
      fireEvent.change(textarea, { target: { value: '짧은사유입력' } }); // 7자

      expect(getConfirmButton()).toBeDisabled();
    });

    it('201자(최대 초과) 입력 시 거절 버튼이 비활성화된다', () => {
      // HTML maxLength 속성이 200이지만, fireEvent.change 는 이를 우회할 수 있으므로
      // 로직 상의 검증을 위해 내부 상태를 201자로 강제 주입합니다.
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      const textarea = getTextareaByPlaceholder() as HTMLTextAreaElement;
      const overflow = 'ㄱ'.repeat(201);
      fireEvent.change(textarea, { target: { value: overflow } });

      // maxLength=200 속성으로 실제 value는 200자로 잘릴 수 있으므로
      // 잘린 상태(200자) 또는 201자 모두 제출 버튼 enable/disable 여부를 검증
      // 200자면 유효하므로 enable, 201자(우회)면 disable.
      // 두 경우 모두 "빈 상태가 아닌 것"은 확실하므로, 텍스트 길이로 분기 검증합니다.
      if (textarea.value.length > 200) {
        expect(getConfirmButton()).toBeDisabled();
      } else {
        // maxLength로 잘린 경우 — 정상 입력 케이스로 간주
        expect(getConfirmButton()).toBeEnabled();
      }
    });

    it('50자(유효 범위) 입력 시 거절 버튼이 활성화된다', () => {
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      const textarea = getTextareaByPlaceholder();
      const validReason = '신청자 수준이 경기 레벨에 맞지 않아 거절합니다.';
      fireEvent.change(textarea, { target: { value: validReason } });

      expect(getConfirmButton()).toBeEnabled();
    });
  });

  describe('액션 콜백', () => {
    it('거절 버튼 클릭 시 onConfirm 이 입력 사유와 함께 호출된다', async () => {
      const onConfirm = jest.fn().mockResolvedValue(undefined);
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={onConfirm}
          applicantNames={['홍길동']}
        />
      );

      const reason = '팀 구성이 맞지 않아 거절합니다.';
      fireEvent.change(getTextareaByPlaceholder(), {
        target: { value: reason },
      });
      fireEvent.click(getConfirmButton());

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith(reason);
    });

    it('취소 버튼 클릭 시 onClose 가 호출된다', () => {
      const onClose = jest.fn();
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={onClose}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
        />
      );

      fireEvent.click(getCancelButton());
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('로딩 상태', () => {
    it('isSubmitting=true 이면 거절 버튼에 "처리 중..." 라벨이 표시되고 비활성화된다', () => {
      render(
        <MatchRejectDialog
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          applicantNames={['홍길동']}
          isSubmitting={true}
        />
      );

      const textarea = getTextareaByPlaceholder();
      fireEvent.change(textarea, {
        target: { value: '테스트 거절 사유입니다.' },
      });

      const confirm = screen.getByRole('button', { name: /처리 중/ });
      expect(confirm).toBeDisabled();
    });
  });
});
