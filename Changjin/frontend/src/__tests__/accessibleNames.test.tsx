/**
 * Names for the things a screen reader would otherwise skip.
 *
 * Measured on the live results page before this: of 45 SVG elements, 11 had
 * no accessible name and were not hidden. Ten of those were the molecule
 * drawings — the main content of every result card — which RDKit emits as a
 * tree of unlabelled <path> elements, so the reader announced nothing for
 * them. The eleventh set is decorative iconography.
 *
 * The filter box had a placeholder and nothing else. A placeholder is not an
 * accessible name and it disappears as soon as the user types, so the field
 * announced as "edit text, blank" exactly when it held a value.
 */
import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';

jest.unstable_mockModule('../hooks/useRDKit', () => ({
  useRDKit: () => ({
    isLoading: false,
    isLoaded: true,
    error: null,
    // A drawing with no text of its own, like the real thing.
    getMoleculeSVG: async () => '<svg><path d="M0 0 L10 10"/></svg>',
    getMoleculeProperties: async () => null,
  }),
}));

const { MoleculeViewer } = await import('../components/molecules/MoleculeViewer');

describe('molecule drawings announce what they are', () => {
  it('names the structure after the compound', async () => {
    render(<MoleculeViewer smiles="CC(=O)Oc1ccccc1C(=O)O" label="ASPIRIN" />);
    expect(await screen.findByRole('img', { name: 'Chemical structure of ASPIRIN' }))
      .toBeInTheDocument();
  });

  it('still names the structure when no compound name is available', async () => {
    render(<MoleculeViewer smiles="CCO" />);
    expect(await screen.findByRole('img', { name: 'Chemical structure' }))
      .toBeInTheDocument();
  });

  it('names the empty state rather than leaving a blank frame', () => {
    render(<MoleculeViewer smiles="" label="ASPIRIN" />);
    expect(screen.getByRole('img', { name: 'No structure available for ASPIRIN' }))
      .toBeInTheDocument();
  });

  it('leaves no unnamed graphic behind', async () => {
    const { container } = render(<MoleculeViewer smiles="CCO" label="ETHANOL" />);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    const unnamed = [...container.querySelectorAll('svg')].filter(svg => {
      const wrapper = svg.closest('[role="img"]');
      return !wrapper && !svg.getAttribute('aria-label') && svg.getAttribute('aria-hidden') !== 'true';
    });
    expect(unnamed).toHaveLength(0);
  });
});
