/**
 * Every address either renders something or says why it does not.
 *
 * Before this there was no catch-all: react-router matched nothing and
 * rendered nothing, so `#/serach` produced a header, a footer, and an empty
 * middle. Verified on the live site before the fix — a single mistyped letter
 * gave a blank page with nothing to click.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotFound } from '../components/layout/NotFound';

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<div>the search page</div>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MemoryRouter>,
  );

describe('an address the app does not have', () => {
  it('explains rather than rendering an empty page', () => {
    at('/serach');
    expect(screen.getByRole('heading', { name: 'No page at this address' }))
      .toBeInTheDocument();
  });

  it('shows the address that failed, since a stale link is the usual cause', () => {
    at('/serach');
    expect(screen.getByText('#/serach')).toBeInTheDocument();
  });

  it('offers a way onward rather than a dead end', () => {
    at('/nope');
    expect(screen.getByRole('link', { name: 'Search compounds' }))
      .toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: 'Therapeutic equivalence' }))
      .toHaveAttribute('href', '/alternatives');
  });

  it('catches the routes that were removed', () => {
    for (const gone of ['/analysis', '/settings', '/help']) {
      const { unmount } = at(gone);
      expect(screen.getByText(`#${gone}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('does not shadow a route that does exist', () => {
    at('/search');
    expect(screen.getByText('the search page')).toBeInTheDocument();
    expect(screen.queryByText('No page at this address')).not.toBeInTheDocument();
  });
});
