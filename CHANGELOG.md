# Changelog

What each version can do. Newest first. Versions follow [Semantic Versioning](https://semver.org):
while Propario is 0.x, the middle number goes up for new features or changed behaviour, the last
for fixes. See "Versions and releases" in the README.

## Unreleased

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
