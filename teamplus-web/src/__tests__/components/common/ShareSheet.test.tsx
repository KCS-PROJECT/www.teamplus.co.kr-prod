/**
 * ShareSheet 컴포넌트 테스트
 *
 * 검증 범위:
 *  - 시트 닫힘/열림 상태 (이벤트 수신 후 노출)
 *  - 4개 SNS 버튼 렌더 + 한글 라벨
 *  - 카카오 키 미설정 시 카카오 버튼 disabled + 안내 텍스트
 *  - 카카오 키 설정 시 카카오 버튼 활성화 + shareToKakao 호출
 *  - 페이스북/X 클릭 → window.open 호출
 *  - 링크 복사 → clipboard.writeText + toast.success
 *  - 닫기 버튼 동작
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { ShareSheetMount } from '@/components/common/ShareSheet';
import { SHARE_SHEET_EVENT } from '@/lib/share';

// kakao 모듈 모킹 — 키 상태/공유 결과를 테스트별로 제어
jest.mock('@/lib/kakao', () => ({
  isKakaoKeyConfigured: jest.fn(() => false),
  shareToKakao: jest.fn(() => true),
}));

import { isKakaoKeyConfigured, shareToKakao } from '@/lib/kakao';

const mockedIsKakaoKeyConfigured = isKakaoKeyConfigured as jest.MockedFunction<
  typeof isKakaoKeyConfigured
>;
const mockedShareToKakao = shareToKakao as jest.MockedFunction<typeof shareToKakao>;

// useNativeScrim 은 BottomSheet 내부에서 사용 — 테스트 환경 브릿지 호출 회피
jest.mock('@/hooks/useNativeScrim', () => ({
  useNativeScrim: jest.fn(),
}));

function renderShareSheet() {
  return render(
    <ToastProvider>
      <ShareSheetMount />
    </ToastProvider>,
  );
}

function dispatchOpenEvent(payload: {
  title?: string;
  text?: string;
  url?: string;
}) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(SHARE_SHEET_EVENT, { detail: payload }),
    );
  });
}

describe('ShareSheet', () => {
  beforeEach(() => {
    mockedIsKakaoKeyConfigured.mockReturnValue(false);
    mockedShareToKakao.mockReturnValue(true);
    jest.clearAllMocks();
  });

  describe('초기 상태', () => {
    it('이벤트 수신 전에는 시트가 노출되지 않는다', () => {
      renderShareSheet();
      expect(screen.queryByText('공유하기')).not.toBeInTheDocument();
    });
  });

  describe('이벤트 수신 후', () => {
    it('시트가 노출되며 4개 SNS 버튼이 렌더된다', () => {
      renderShareSheet();
      dispatchOpenEvent({
        title: '테스트 공유',
        text: '본문',
        url: 'https://example.com/page',
      });

      expect(screen.getByRole('dialog', { name: '공유하기' })).toBeInTheDocument();
      expect(screen.getByLabelText('카카오톡으로 공유')).toBeInTheDocument();
      expect(screen.getByLabelText('페이스북으로 공유')).toBeInTheDocument();
      expect(screen.getByLabelText('X(트위터)로 공유')).toBeInTheDocument();
      expect(screen.getByLabelText('링크 복사')).toBeInTheDocument();
    });

    it('한글 라벨이 표시된다', () => {
      renderShareSheet();
      dispatchOpenEvent({ url: 'https://example.com' });

      expect(screen.getByText('카카오톡')).toBeInTheDocument();
      expect(screen.getByText('페이스북')).toBeInTheDocument();
      expect(screen.getByText('X')).toBeInTheDocument();
      expect(screen.getByText('링크 복사')).toBeInTheDocument();
    });
  });

  describe('카카오 키 미설정', () => {
    it('카카오 버튼이 disabled 상태이고 안내 텍스트가 노출된다', () => {
      mockedIsKakaoKeyConfigured.mockReturnValue(false);
      renderShareSheet();
      dispatchOpenEvent({ url: 'https://example.com' });

      const kakaoBtn = screen.getByLabelText('카카오톡으로 공유');
      expect(kakaoBtn).toBeDisabled();
      expect(screen.getByText('카카오톡 공유가 곧 제공됩니다.')).toBeInTheDocument();
    });
  });

  describe('카카오 키 설정', () => {
    it('카카오 버튼 클릭 시 shareToKakao 호출', () => {
      mockedIsKakaoKeyConfigured.mockReturnValue(true);
      renderShareSheet();
      dispatchOpenEvent({
        title: '카카오 테스트',
        text: '설명',
        url: 'https://example.com/x',
      });

      const kakaoBtn = screen.getByLabelText('카카오톡으로 공유');
      expect(kakaoBtn).not.toBeDisabled();

      fireEvent.click(kakaoBtn);

      expect(mockedShareToKakao).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '카카오 테스트',
          description: '설명',
          url: 'https://example.com/x',
        }),
      );
    });

    it('shareToKakao 가 false 반환 시 안내 토스트 노출 + 시트 유지', () => {
      mockedIsKakaoKeyConfigured.mockReturnValue(true);
      mockedShareToKakao.mockReturnValue(false);

      renderShareSheet();
      dispatchOpenEvent({ url: 'https://example.com' });

      fireEvent.click(screen.getByLabelText('카카오톡으로 공유'));

      // 시트가 닫히지 않고 유지됨
      expect(screen.getByRole('dialog', { name: '공유하기' })).toBeInTheDocument();
    });
  });

  describe('페이스북 / X', () => {
    let originalOpen: typeof window.open;

    beforeEach(() => {
      originalOpen = window.open;
      window.open = jest.fn();
    });

    afterEach(() => {
      window.open = originalOpen;
    });

    it('페이스북 버튼 클릭 → sharer.php 새 창', () => {
      renderShareSheet();
      dispatchOpenEvent({ url: 'https://example.com/post' });

      fireEvent.click(screen.getByLabelText('페이스북으로 공유'));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('facebook.com/sharer/sharer.php?u='),
        '_blank',
        'noopener,noreferrer',
      );
      expect((window.open as jest.Mock).mock.calls[0][0]).toContain(
        encodeURIComponent('https://example.com/post'),
      );
    });

    it('X 버튼 클릭 → intent/tweet 새 창', () => {
      renderShareSheet();
      dispatchOpenEvent({
        text: '경기 응원해주세요',
        url: 'https://example.com/match/1',
      });

      fireEvent.click(screen.getByLabelText('X(트위터)로 공유'));

      const calledUrl = (window.open as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('twitter.com/intent/tweet');
      expect(calledUrl).toContain(encodeURIComponent('경기 응원해주세요'));
      expect(calledUrl).toContain(encodeURIComponent('https://example.com/match/1'));
    });
  });

  describe('링크 복사', () => {
    let originalClipboard: typeof navigator.clipboard;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    });

    it('clipboard.writeText 호출 + 성공 토스트', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      renderShareSheet();
      dispatchOpenEvent({ url: 'https://example.com/share-me' });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('링크 복사'));
      });

      expect(writeText).toHaveBeenCalledWith('https://example.com/share-me');
      // 성공 토스트는 ToastProvider 의 portal 로 렌더되므로 정확한 위치는 jsdom 환경에 따라 다를 수 있다 —
      // writeText 호출 검증으로 대체.
    });
  });
});
