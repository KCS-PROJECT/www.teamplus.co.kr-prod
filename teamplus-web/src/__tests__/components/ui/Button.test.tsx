import { render, screen, fireEvent } from '@testing-library/react';
import { Button, IconButton, Fab } from '@/components/ui/Button';

describe('Button Component', () => {
  describe('Rendering', () => {
    it('renders children correctly', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button')).toHaveTextContent('Click me');
    });

    it('renders with default props', () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });
  });

  describe('Variants', () => {
    it('applies primary variant styles', () => {
      render(<Button variant="primary">Primary</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary');
    });

    it('applies secondary variant styles', () => {
      render(<Button variant="secondary">Secondary</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-slate-100');
    });

    it('applies danger variant styles', () => {
      render(<Button variant="danger">Danger</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-error');
    });

    it('applies success variant styles', () => {
      render(<Button variant="success">Success</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-success');
    });
  });

  describe('Sizes', () => {
    it('applies sm size with minimum 44px height', () => {
      render(<Button size="sm">Small</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('min-h-[44px]');
    });

    it('applies md size with 48px height', () => {
      render(<Button size="md">Medium</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('min-h-[48px]');
    });

    it('applies lg size with 56px height', () => {
      render(<Button size="lg">Large</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('min-h-[56px]');
    });
  });

  describe('Interactions', () => {
    it('calls onClick handler when clicked', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick} disabled>Disabled</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading text when loading', () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    });

    it('disables button when loading', () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('does not call onClick when loading', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick} loading>Submit</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Full Width', () => {
    it('applies full width when fullWidth prop is true', () => {
      render(<Button fullWidth>Full Width</Button>);
      expect(screen.getByRole('button')).toHaveClass('w-full');
    });
  });

  describe('Accessibility', () => {
    it('has correct button type', () => {
      render(<Button>Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('can be focused', () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });

    it('has focus ring styles', () => {
      render(<Button>Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus:ring-2');
    });
  });
});

describe('IconButton Component', () => {
  it('renders correctly', () => {
    render(<IconButton>X</IconButton>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('applies WCAG minimum touch target', () => {
    render(<IconButton size="sm">X</IconButton>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('w-11', 'h-11');
  });

  it('is rounded', () => {
    render(<IconButton>X</IconButton>);
    expect(screen.getByRole('button')).toHaveClass('rounded-full');
  });
});

describe('Fab Component', () => {
  it('renders correctly', () => {
    render(<Fab>+</Fab>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has shadow for floating effect', () => {
    render(<Fab>+</Fab>);
    expect(screen.getByRole('button')).toHaveClass('shadow-lg');
  });

  it('applies primary variant', () => {
    render(<Fab variant="primary">+</Fab>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary');
  });
});
