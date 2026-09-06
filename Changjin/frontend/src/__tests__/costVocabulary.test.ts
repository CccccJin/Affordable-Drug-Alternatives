import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * `CONTEXT.md` bans "Price" for an amount: a NADAC acquisition cost, a
 * reimbursement rate and a patient's copay differ by an order of magnitude and
 * the word separates none of them.
 *
 * The Python side holds the same line on generated reports
 * (`test_no_report_table_heads_an_amount_column_as_a_bare_price`). This is the
 * user-facing half, and it matters more: a table on a page is what gets
 * screenshotted, and the disclaimer above it does not travel with the image.
 */

const SRC = join(process.cwd(), 'src');

const sources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    // `readdirSync`, not `fs.globSync`: the latter needs Node 22 and CI runs
    // Node 20, so a glob here passes locally and fails the deploy gate.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(SRC);
  return out;
};

/** Words that say which money a figure is. */
const NAMES_A_BASIS = /NADAC|[Aa]cquisition|[Rr]eimburs|[Cc]opay|[Pp]atient pays/;

describe('an amount always says which money it is', () => {
  it('heads no visible column with a bare currency label', () => {
    const offences: string[] = [];
    for (const file of sources()) {
      readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
        // Both spellings of the same label: a literal `$ / unit`, and the
        // JSX form where an interpolation sits between the two, which is how
        // `SwitchSummary` slipped past the first version of this test.
        const literal = /\$\s*\/\s*unit/i.test(line);
        const interpolated = /\$\{[^}]*\}\s*\/\s*\{?\s*unit/i.test(line);
        if (!literal && !interpolated) return;
        if (NAMES_A_BASIS.test(line)) return;
        offences.push(`${file.replace(SRC, 'src')}:${i + 1} ${line.trim()}`);
      });
    }
    expect(offences).toEqual([]);
  });

  it('reads the amount under a name that says which money it is', () => {
    const offences: string[] = [];
    for (const file of sources()) {
      readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
        if (!/\bpricePerUnit\b/.test(line)) return;
        // The parse boundary keeps the old name alive until the contract step.
        if (file.endsWith('types/api.ts') || file.includes('services/api/')) return;
        offences.push(`${file.replace(SRC, 'src')}:${i + 1} ${line.trim()}`);
      });
    }
    expect(offences).toEqual([]);
  });
});
