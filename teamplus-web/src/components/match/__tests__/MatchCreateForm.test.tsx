/**
 * MatchCreateForm 컴포넌트 단위 테스트.
 *
 * Phase 4-B — 매치 등록/수정 공통 폼의 라벨 분기, 초기값, 입력 검증, 제출을 검증합니다.
 *
 * 검증 대상:
 * - mode='create' / 'edit' 제출 버튼 라벨 분기
 * - initialValues 반영
 * - 제목 3자 미만 / 인원 범위 / 참가비 범위 에러
 * - 유효한 값 제출 시 onSubmit 호출
 * - isSubmitting 로딩 상태
 *
 * 구현 주의:
 * MatchCreateForm 의 제출 버튼은 `<button form="match-form" type="submit">` 으로
 * 외부(sticky bottom) 에 위치합니다. JSDOM 은 fireEvent.click 으로 버튼을 클릭해도
 * 외부 form 연결을 통한 submit 이벤트 디스패치가 보장되지 않으므로, 테스트에서는
 * 직접 `fireEvent.submit(form)` 으로 폼 submit 이벤트를 트리거합니다.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  MatchCreateForm,
  MatchFormValues,
} from '@/components/match/MatchCreateForm';

describe('MatchCreateForm', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * 폼 검증을 통과하는 기본 유효값 세트. 각 테스트에서 필요한 부분만 override 합니다.
   */
  const VALID_VALUES: Partial<MatchFormValues> = {
    title: '주말 오전 친선 경기',
    date: '2026-05-01',
    time: '09:00',
    rinkName: '팀플러스 링크',
    rinkAddress: '서울특별시 강남구',
    price: 30000,
    level: '중급',
    levelCode: 'B',
    gender: '혼성',
    maxParticipants: 20,
    rulesText: '보호장비 필수',
    description: '주차는 현장 확인 바랍니다.',
  };

  /** 현재 document 내 form 요소를 찾아 submit 이벤트 디스패치 */
  const submitForm = (container: HTMLElement) => {
    const form = container.querySelector('form');
    if (!form) {
      throw new Error('MatchCreateForm 테스트: form 요소를 찾을 수 없습니다.');
    }
    fireEvent.submit(form);
  };

  const getSubmitButton = (label: RegExp | string) =>
    screen.getByRole('button', { name: label });

  describe('모드별 라벨 분기', () => {
    it('mode="create" 이면 제출 버튼 라벨이 "매치 등록하기"', () => {
      render(<MatchCreateForm mode="create" onSubmit={jest.fn()} />);
      expect(getSubmitButton(/매치 등록하기/)).toBeInTheDocument();
    });

    it('mode="edit" 이면 제출 버튼 라벨이 "매치 수정하기"', () => {
      render(<MatchCreateForm mode="edit" onSubmit={jest.fn()} />);
      expect(getSubmitButton(/매치 수정하기/)).toBeInTheDocument();
    });
  });

  describe('초기값 반영', () => {
    it('initialValues 의 title 이 input 에 반영된다', () => {
      render(
        <MatchCreateForm
          mode="edit"
          initialValues={{ title: '초기 매치 제목' }}
          onSubmit={jest.fn()}
        />
      );

      const titleInput = screen.getByPlaceholderText(
        /예: 주말 오전 친선 경기/
      ) as HTMLInputElement;
      expect(titleInput.value).toBe('초기 매치 제목');
    });

    it('initialValues 의 rinkName 이 input 에 반영된다', () => {
      render(
        <MatchCreateForm
          mode="edit"
          initialValues={{ rinkName: '테스트 링크' }}
          onSubmit={jest.fn()}
        />
      );

      const rinkInput = screen.getByPlaceholderText(
        /구장을 검색하세요/
      ) as HTMLInputElement;
      expect(rinkInput.value).toBe('테스트 링크');
    });
  });

  describe('유효성 검증', () => {
    it('제목 3자 미만 제출 시 에러 메시지를 표시하고 onSubmit 이 호출되지 않는다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={{ ...VALID_VALUES, title: 'ab' }}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(screen.getByRole('alert')).toHaveTextContent(
        /매치 제목은 3자 이상 입력해 주세요/
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('인원 1명 입력 시(2 미만) 에러 메시지를 표시한다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={{ ...VALID_VALUES, maxParticipants: 1 }}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(screen.getByRole('alert')).toHaveTextContent(
        /모집 인원은 2명 이상 30명 이하/
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('인원 31명 입력 시(30 초과) 에러 메시지를 표시한다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={{ ...VALID_VALUES, maxParticipants: 31 }}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(screen.getByRole('alert')).toHaveTextContent(
        /모집 인원은 2명 이상 30명 이하/
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('참가비 -1 입력 시 에러 메시지를 표시한다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={{ ...VALID_VALUES, price: -1 }}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(screen.getByRole('alert')).toHaveTextContent(/참가비는 0원 이상/);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('일자/시간 누락 시 에러 메시지를 표시한다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={{ ...VALID_VALUES, date: '', time: '' }}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(screen.getByRole('alert')).toHaveTextContent(
        /일자와 시간을 입력해 주세요/
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('구장명 누락 시 에러 메시지를 표시한다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={{ ...VALID_VALUES, rinkName: '' }}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(screen.getByRole('alert')).toHaveTextContent(
        /구장 정보를 입력해 주세요/
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('정상 제출', () => {
    it('유효한 값 제출 시 onSubmit 이 전체 폼 값과 함께 호출된다', () => {
      const onSubmit = jest.fn();
      const { container } = render(
        <MatchCreateForm
          mode="create"
          initialValues={VALID_VALUES}
          onSubmit={onSubmit}
        />
      );

      submitForm(container);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const submitted = onSubmit.mock.calls[0][0] as MatchFormValues;
      expect(submitted.title).toBe('주말 오전 친선 경기');
      expect(submitted.rinkName).toBe('팀플러스 링크');
      expect(submitted.price).toBe(30000);
      expect(submitted.maxParticipants).toBe(20);
      expect(submitted.level).toBe('중급');
      expect(submitted.gender).toBe('혼성');
    });
  });

  describe('로딩 상태', () => {
    it('isSubmitting=true 이면 제출 버튼이 비활성화되고 "처리 중..." 라벨이 노출된다', () => {
      render(
        <MatchCreateForm
          mode="create"
          initialValues={VALID_VALUES}
          onSubmit={jest.fn()}
          isSubmitting={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /처리 중/ });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('취소 버튼', () => {
    it('onCancel 제공 시 취소 버튼 클릭이 onCancel 을 호출한다', () => {
      const onCancel = jest.fn();
      render(
        <MatchCreateForm
          mode="edit"
          initialValues={VALID_VALUES}
          onSubmit={jest.fn()}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^취소$/ }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('외부 에러', () => {
    it('error prop 이 제공되면 경고 박스에 노출된다', () => {
      render(
        <MatchCreateForm
          mode="create"
          initialValues={VALID_VALUES}
          onSubmit={jest.fn()}
          error="서버 오류가 발생했습니다."
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent(
        '서버 오류가 발생했습니다.'
      );
    });
  });
});
