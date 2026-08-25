/**
 * useContentLinkHandler — 본문 외부 링크 공통 규약 분기 회귀 테스트 (Codex R1-6).
 * 계약: 웹=새 탭 / 신앱=confirm→기본 브라우저 / 구앱=차단+업데이트 안내 /
 *       실행 실패=일반 실패 안내 / same-origin=앱 내 라우팅 / 같은 문서 fragment·
 *       tel:/mailto:/sms:·수정키 클릭=기본 동작 통과 / 위험 스킴=차단.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockConfirm = jest.fn();
const mockToastInfo = jest.fn();
const mockToastError = jest.fn();
const mockNavigate = jest.fn();
const mockOpenExternal = jest.fn();
let mockIsNative = false;

jest.mock('@/components/ui/Modal', () => ({
  useModal: () => ({ modal: { confirm: mockConfirm } }),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: { info: mockToastInfo, error: mockToastError, success: jest.fn() },
  }),
}));
jest.mock('@/components/ui/NavLink', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@/services/native-bridge', () => ({
  navigation: {
    openExternal: (...args: unknown[]) => mockOpenExternal(...args),
  },
}));
jest.mock('@/lib/environment', () => ({
  ...jest.requireActual('@/lib/environment'),
  isNativeApp: () => mockIsNative,
}));

import { useContentLinkHandler } from '../useContentLinks';

function Harness({ html }: { html: string }) {
  const onClick = useContentLinkHandler();
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- 테스트 하네스
    <div data-testid="body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function clickAnchor(html: string, options?: MouseEventInit): boolean {
  render(<Harness html={html} />);
  const anchor = screen.getByTestId('body').querySelector('a');
  if (!anchor) throw new Error('anchor not rendered');
  // fireEvent 반환값: 기본 동작이 취소되지 않았으면 true
  return fireEvent.click(anchor, options);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsNative = false;
  mockConfirm.mockResolvedValue(true);
  mockOpenExternal.mockResolvedValue({ status: 'opened' });
});

describe('웹 브라우저 환경', () => {
  it('외부 링크 — confirm 없이 openExternal(새 탭 경로) 호출 + 기본 이동 차단', () => {
    const notPrevented = clickAnchor('<a href="https://teamplus.icetimes.co.kr/solution">안내</a>');
    expect(notPrevented).toBe(false);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockOpenExternal).toHaveBeenCalledWith('https://teamplus.icetimes.co.kr/solution');
  });

  it('same-origin 링크 — 앱 내 라우팅(navigate)', () => {
    clickAnchor('<a href="/contents/other-post">다른 글</a>');
    expect(mockNavigate).toHaveBeenCalledWith('/contents/other-post');
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('같은 문서 fragment — 기본 앵커 스크롤 동작 통과', () => {
    const notPrevented = clickAnchor('<a href="#section">섹션</a>');
    expect(notPrevented).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('tel: 링크 — 통과(방어 분기)', () => {
    const notPrevented = clickAnchor('<a href="tel:01012345678">전화</a>');
    expect(notPrevented).toBe(true);
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('위험 스킴(javascript:) — 차단', () => {
    // dangerouslySetInnerHTML 로 javascript: 앵커를 직접 구성 (살균 전 단계 방어 검증)
    const notPrevented = clickAnchor(`<a href="javascript:alert(1)">x</a>`);
    expect(notPrevented).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('수정키(Ctrl) 클릭 — 안전한 링크는 브라우저 기본 동작에 맡김', () => {
    const notPrevented = clickAnchor(
      '<a href="https://example.com">x</a>',
      { ctrlKey: true },
    );
    expect(notPrevented).toBe(true);
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('수정키(Ctrl) 클릭이라도 위험 스킴은 차단한다 (R2 회귀 가드)', () => {
    const notPrevented = clickAnchor(`<a href="javascript:alert(1)">x</a>`, {
      ctrlKey: true,
    });
    expect(notPrevented).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('문서 상대 경로(./)는 현재 문서 기준으로 해석해 라우팅한다', () => {
    window.history.pushState({}, '', '/contents/hockey/');
    try {
      clickAnchor('<a href="./gear">장비</a>');
      expect(mockNavigate).toHaveBeenCalledWith('/contents/hockey/gear');
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('same-origin + 쿼리스트링 — 쿼리를 보존해 라우팅한다', () => {
    clickAnchor('<a href="/contents?category=GUIDE">가이드</a>');
    expect(mockNavigate).toHaveBeenCalledWith('/contents?category=GUIDE');
  });
});

describe('앱(네이티브) 환경', () => {
  beforeEach(() => {
    mockIsNative = true;
  });

  it('confirm 승인 → fallbackToNewTab:false 로 브릿지 호출 (iOS 좌초 방지 계약)', async () => {
    clickAnchor('<a href="https://example.com/page">외부</a>');
    await waitFor(() => expect(mockOpenExternal).toHaveBeenCalled());
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockOpenExternal).toHaveBeenCalledWith({
      url: 'https://example.com/page',
      fallbackToNewTab: false,
    });
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('confirm 취소 → 아무 것도 열지 않음', async () => {
    mockConfirm.mockResolvedValue(false);
    clickAnchor('<a href="https://example.com">외부</a>');
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('구앱(unsupported) → 업데이트 안내 토스트, 셸 내 이동 없음', async () => {
    mockOpenExternal.mockResolvedValue({ status: 'unsupported' });
    const notPrevented = clickAnchor('<a href="https://example.com">외부</a>');
    expect(notPrevented).toBe(false);
    await waitFor(() => expect(mockToastInfo).toHaveBeenCalled());
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('실행 실패(failed) → 일반 실패 토스트 (업데이트 안내 아님)', async () => {
    mockOpenExternal.mockResolvedValue({ status: 'failed' });
    clickAnchor('<a href="https://example.com">외부</a>');
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastInfo).not.toHaveBeenCalled();
  });
});
