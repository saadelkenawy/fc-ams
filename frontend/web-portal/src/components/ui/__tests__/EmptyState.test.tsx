import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and optional description', () => {
    render(<EmptyState title="No appointments" description="Book the first one" />);
    expect(screen.getByText('No appointments')).toBeInTheDocument();
    expect(screen.getByText('Book the first one')).toBeInTheDocument();
  });

  it('renders the action button and forwards clicks', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Calendar}
        title="Empty"
        action={{ label: 'Book appointment', onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book appointment' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders no button without an action', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
