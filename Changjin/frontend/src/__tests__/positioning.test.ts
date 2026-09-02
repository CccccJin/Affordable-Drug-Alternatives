/**
 * The site says what it is.
 *
 * The landing page promised "Find affordable drug alternatives" and the meta
 * description promised "AI-powered chemical similarity search". Neither was
 * true of what ships: the search is an ECFP4/Tanimoto computation in the
 * browser — the ChemBERTa path is backend-only and undeployed — and the
 * results page states in as many words that similarity is not
 * substitutability.
 *
 * The gap matters beyond tidiness. A visitor who arrives expecting a consumer
 * price comparison reads every number here as advice about their own
 * medication, which is the specific outcome the disclaimers throughout this
 * project exist to prevent.
 *
 * Asserted against the source because there is no runtime surface for a
 * <title> or a <meta>, and because a promise creeping back into the copy would
 * otherwise be invisible to every other test.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Source with comments stripped.
 *
 * The comments explaining these changes quote the old copy verbatim — "Find
 * affordable drug alternatives", "AI-powered" — so asserting against the raw
 * file flags the explanation of the fix as the fix's absence. What matters is
 * the text that reaches a reader.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')      // /* ... */ and {/* ... */}
    .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments
    .replace(/^\s*\/\/.*$/gm, '');          // // ...

describe('the landing page', () => {
  const source = read('src', 'components', 'search', 'SearchForm.tsx');

  it('does not promise to find affordable alternatives', () => {
    expect(source).not.toMatch(/Find\s*\{?'?\s*'?\}?\s*<Box[\s\S]{0,400}?affordable/);
    expect(source).not.toMatch(/drug alternatives/);
  });

  it('describes the computation it actually performs', () => {
    expect(source).toMatch(/Morgan\/Tanimoto/);
    expect(source).toMatch(/in your browser/);
  });

  it('points at the FDA lookup for the substitutability question', () => {
    expect(source).toMatch(/to="\/alternatives"/);
    expect(source).toMatch(/therapeutic equivalence lookup/i);
  });

  it('says it is not medical advice', () => {
    expect(source).toMatch(/(not|neither is) medical advice/i);
  });
});

describe('the document head', () => {
  const html = read('index.html');

  it('does not call the shipped search AI-powered', () => {
    // ChemBERTa exists, in a backend nothing deploys. What runs here is ECFP4.
    expect(html).not.toMatch(/AI-powered/i);
  });

  it('does not promise affordable drug alternatives in the title', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    expect(title).not.toMatch(/affordable/i);
    expect(title).toMatch(/similarity/i);
  });

  it('names both halves of what the site does', () => {
    const description = html.match(/name="description"[\s\S]*?content="([^"]*)"/)?.[1] ?? '';
    expect(description).toMatch(/similarity/i);
    expect(description).toMatch(/FDA/);
    expect(description).toMatch(/not medical advice/i);
  });
});
