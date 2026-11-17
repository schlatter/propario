# Changelog

What each version can do. Newest first. Versions follow [Semantic Versioning](https://semver.org):
while Propario is 0.x, the middle number goes up for new features or changed behaviour, the last
for fixes. See "Versions and releases" in the README.

## Unreleased

- Clicking a product's name opens its details; the shop page opens with the ↗ button next to
  it, in a new tab.
- Tall product pictures stay inside their box in the details and on swipe cards instead of
  covering the text below.
- A calmer, more compact comparison page: name and category sit in the top bar next to
  Propario, the stage is a small menu next to the tabs, "+ Product" opens the quick entry,
  export moved into the ⋯ menu, and the menu button opens the sections as a list. The language
  is chosen in Settings.
- Columns move by dragging their header sideways (or Alt+←/→, or the arrows in "Columns").
- Excel import fetches the product pictures right away, where the shops allow it.
- Swipe mode: go through a comparison one product at a time – like it or not. Everyone votes
  for themselves; the votes appear as a column in the table.
- Move rows in the product table by dragging the handle (or with the arrow keys on it).

## 0.2.0 — 2026-11-16

- Renamed to **Propario**.
- Comparisons live on the server, encrypted at rest, and can be shared with other people on the
  instance – to view or to edit. Changes from others arrive within seconds; edits of different
  fields merge.
- Sign-in with passkeys, invitation-only accounts, one-time recovery key, account deletion.
- Product pictures: fetched from the product link (or pasted, dropped, chosen), stored on the
  server, shown as thumbnails that grow on hover.
- Comparisons kept in the browser by 0.1 can be moved into the account (_Backup_).
- Container: Node server with hardened defaults (read-only, no capabilities, limits).

## 0.1.0 — 2026-11-15

- First version: comparisons in the browser, Excel import and export, requirements with
  automatic checks, side-by-side view, backups.
