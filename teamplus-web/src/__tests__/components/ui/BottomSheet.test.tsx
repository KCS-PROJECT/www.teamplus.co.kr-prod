import { act, fireEvent, render, screen } from '@testing-library/react';
import { BottomSheet } from '@/components/ui/BottomSheet';

jest.mock('@/hooks/useNativeScrim', () => ({
  useNativeScrim: jest.fn(),
}));

function renderBottomSheet(isOpen: boolean, onClose = jest.fn()) {
  const view = (open: boolean) => (
    <BottomSheet isOpen={open} onClose={onClose} title="필터">
      <button type="button">최신순</button>
    </BottomSheet>
  );

  const rendered = render(view(isOpen));
  return {
    onClose,
    rerenderOpen: (open: boolean) => rendered.rerender(view(open)),
    ...rendered,
  };
}

describe('BottomSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('opens from the bottom with the sheet-up animation', () => {
    renderBottomSheet(true);

    const dialog = screen.getByRole('dialog', { name: '필터' });
    const sheet = dialog.querySelector('[data-bottom-sheet-panel]');
    const dim = dialog.querySelector('[data-bottom-sheet-dim]');

    expect(sheet).toHaveClass('animate-sheet-up');
    expect(dim).toHaveClass('animate-overlay-in');
  });

  it('plays the closing animation before unmounting', () => {
    const onClose = jest.fn();
    const { rerenderOpen } = renderBottomSheet(true, onClose);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    rerenderOpen(false);

    expect(onClose).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog', { name: '필터' });
    const sheet = dialog.querySelector('[data-bottom-sheet-panel]');
    const dim = dialog.querySelector('[data-bottom-sheet-dim]');

    expect(sheet).toHaveClass('animate-sheet-down');
    expect(dim).toHaveClass('animate-overlay-out');

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('dialog', { name: '필터' })).not.toBeInTheDocument();
  });

  it('starts closing when the dimmed backdrop is clicked', () => {
    const onClose = jest.fn();
    const { rerenderOpen } = renderBottomSheet(true, onClose);

    const dialog = screen.getByRole('dialog', { name: '필터' });
    const dim = dialog.querySelector('[data-bottom-sheet-dim]');
    expect(dim).toBeInstanceOf(HTMLElement);

    fireEvent.click(dim as HTMLElement);
    rerenderOpen(false);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector('[data-bottom-sheet-panel]')).toHaveClass(
      'animate-sheet-down',
    );
  });

  it('closes only the topmost sheet when nested sheets receive Escape', () => {
    const onParentClose = jest.fn();
    const onChildClose = jest.fn();

    render(
      <BottomSheet isOpen onClose={onParentClose} title="부모 시트">
        <BottomSheet
          isOpen
          onClose={onChildClose}
          title="자식 시트"
          manageNativeScrim={false}
        >
          <span>시간 선택</span>
        </BottomSheet>
      </BottomSheet>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onChildClose).toHaveBeenCalledTimes(1);
    expect(onParentClose).not.toHaveBeenCalled();
  });

  it('restores body scrolling after nested sheets unmount together', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = render(
      <BottomSheet isOpen onClose={jest.fn()} title="부모 시트">
        <BottomSheet
          isOpen
          onClose={jest.fn()}
          title="자식 시트"
          manageNativeScrim={false}
        >
          <span>시간 선택</span>
        </BottomSheet>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });
});
