import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SimilarityCaveat } from '../components/results/SimilarityCaveat';

/**
 * The results list is the default landing page for every search and the place
 * where structural similarity gets read as substitutability. These pin the two
 * claims that stop it.
 */
const renderCaveat = () =>
  render(
    <MemoryRouter>
      <SimilarityCaveat />
    </MemoryRouter>
  );

describe('SimilarityCaveat', () => {
  it('says the percentages are structural, not a claim about substitution', () => {
    renderCaveat();
    expect(screen.getByText(/structural/i)).toBeInTheDocument();
    expect(
      screen.getByText(/say nothing about whether one\s+drug can be used in place of another/i)
    ).toBeInTheDocument();
  });

  it('names the counterexample that makes the point concrete', () => {
    // A salt of the same molecule is Tanimoto 1.0 and not an approved
    // substitute — the hardest-negative class in EVALUATION_REPORT.md.
    renderCaveat();
    expect(
      screen.getByText(/salt of the same molecule scores\s+1\.000 here and is still not an approved substitute/i)
    ).toBeInTheDocument();
  });

  it('sends the reader to the page that does answer the question', () => {
    renderCaveat();
    const link = screen.getByRole('link', { name: /therapeutic equivalence lookup/i });
    expect(link).toHaveAttribute('href', '/alternatives');
  });

  it('disclaims medical advice', () => {
    renderCaveat();
    expect(
      screen.getByText(/Nothing on this page is medical advice/i)
    ).toBeInTheDocument();
  });
});
