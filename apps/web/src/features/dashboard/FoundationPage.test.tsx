import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoundationPage } from './FoundationPage';
describe('Fundação', () => {
  it('explicita o estado de desenvolvimento e o próximo controle de segurança', () => {
    render(<FoundationPage />);
    expect(
      screen.getByRole('heading', { name: 'Fundação pronta para evoluir.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Autenticação administrativa, MFA/)).toBeInTheDocument();
    expect(
      screen.getByText(/Integrações externas e módulos comerciais ainda não implementados/),
    ).toBeInTheDocument();
  });
});
