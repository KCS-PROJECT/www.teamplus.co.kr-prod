/**
 * NavLink historyMode — R3-01 회귀.
 *
 * 계약 고정:
 *   · historyMode="replace" 여도 DOM 은 실제 href 를 가진 링크(role=link) — 새 탭/링크 복사/
 *     스크린 리더 의미 보존
 *   · 일반 무수정 좌클릭만 replace 1회 위임 (push 없음)
 *   · Ctrl/Cmd·Shift·Alt·비주 클릭은 replace/push 모두 없음 — 네이티브 링크 동작 유지
 *     (preventDefault 미호출)
 *   · 기본(push) 모드의 일반 좌클릭은 기존대로 navigate
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { NavLink } from '@/components/ui/NavLink';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/notice/current',
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockReplace.mockReset();
});

function renderReplaceLink() {
  render(
    <NavLink href="/notice/n2" historyMode="replace">
      다음글
    </NavLink>,
  );
  return screen.getByRole('link', { name: '다음글' });
}

describe('NavLink historyMode="replace" — 링크 시맨틱 + 이벤트 계약', () => {
  it('DOM 은 실제 href 를 가진 link 역할이다', () => {
    const link = renderReplaceLink();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/notice/n2');
  });

  it('일반 좌클릭은 replace 1회 — push 는 호출되지 않는다', () => {
    const link = renderReplaceLink();

    fireEvent.click(link, { button: 0 });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/notice/n2', expect.anything());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['비주(휠)', { button: 1 }],
  ])('%s 클릭은 가로채지 않는다 — 네이티브 링크 동작 유지', (_label, eventInit) => {
    const link = renderReplaceLink();

    // fireEvent.click 은 preventDefault 여부를 반환값(false=prevented)으로 노출한다
    const notPrevented = fireEvent.click(link, { button: 0, ...eventInit });

    expect(notPrevented).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('NavLink 기본(push) 모드 회귀', () => {
  it('일반 좌클릭은 기존대로 navigate 로 위임된다', () => {
    render(<NavLink href="/notice/n3">목록의 공지</NavLink>);

    fireEvent.click(screen.getByRole('link', { name: '목록의 공지' }), {
      button: 0,
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Shift 클릭은 push 로도 가로채지 않는다 — R3-01 동반 수정', () => {
    render(<NavLink href="/notice/n3">목록의 공지</NavLink>);

    fireEvent.click(screen.getByRole('link', { name: '목록의 공지' }), {
      button: 0,
      shiftKey: true,
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
