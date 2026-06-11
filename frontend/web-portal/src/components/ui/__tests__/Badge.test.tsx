import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, AppointmentStatusBadge } from '../Badge';

describe('Badge', () => {
  it('renders children with the variant class', () => {
    render(<Badge variant="success">Paid</Badge>);
    expect(screen.getByText('Paid')).toHaveClass('bg-emerald-100');
  });

  it('defaults to the neutral variant', () => {
    render(<Badge>Plain</Badge>);
    expect(screen.getByText('Plain')).toHaveClass('bg-gray-100');
  });
});

describe('AppointmentStatusBadge', () => {
  it('renders the Arabic label by default', () => {
    render(<AppointmentStatusBadge status="Conf." />);
    expect(screen.getByText('مؤكد')).toBeInTheDocument();
  });

  it('renders the English label when lang=en', () => {
    render(<AppointmentStatusBadge status="Canc." lang="en" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});
