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
import { TextField, InputAdornment } from '@mui/material';

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

describe('the results filter announces itself', () => {
  /* `aria-label` on a MUI TextField lands on the outer FormControl and never
     reaches the <input>. The attribute is present in the source, the field is
     still nameless in the DOM, and nothing errors — which is how the first
     attempt at this shipped and had to be caught by re-auditing the live page.
     Querying by role is what distinguishes the two. */
  const Filter = ({ useInputProps }: { useInputProps: boolean }) =>
    useInputProps ? (
      <TextField
        placeholder="Filter results…"
        inputProps={{ 'aria-label': 'Filter these results by name, ChEMBL id or SMILES' }}
        InputProps={{ startAdornment: <InputAdornment position="start">x</InputAdornment> }}
      />
    ) : (
      <TextField
        placeholder="Filter results…"
        aria-label="Filter these results by name, ChEMBL id or SMILES"
      />
    );

  it('names the input itself', () => {
    render(<Filter useInputProps />);
    expect(screen.getByRole('textbox', {
      name: 'Filter these results by name, ChEMBL id or SMILES',
    })).toBeInTheDocument();
  });

  it('shows why aria-label on the TextField is not enough', () => {
    render(<Filter useInputProps={false} />);
    expect(screen.queryByRole('textbox', {
      name: 'Filter these results by name, ChEMBL id or SMILES',
    })).not.toBeInTheDocument();
  });
});
