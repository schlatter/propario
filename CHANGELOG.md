# Changelog

What each version can do. Newest first. Versions follow [Semantic Versioning](https://semver.org):
while Propario is 0.x, the middle number goes up for new features or changed behaviour, the last
for fixes. See "Versions and releases" in the README.

## Unreleased

- **Requirements in their column:** a rule such as "Depth ≤ 40" tints the depth cells green or
  red with a quiet ✓ or ✕ in front of the value; the column header shows the rule and filters
  by it (all → met → not met). Values stay as they are for sorting and filtering.
- Yes/no fields show ✓ and ✕ instead of words.
- The requirements column shows two bars, must criteria above the others, each with its count
  ("Must 2/2", "Other 0/31").
- Double-click a column's edge to fit its width to header and values.
- Fixed: number cells told screen readers the bare number instead of what is shown ("38 cm");
  a unit typed for one number field no longer sticks to the next field of another type.
- **More from the shop page:** adding a product by link now also takes its name, brand, kind
  of product (category or breadcrumb), colour, description and data sheet. Lines go into the
  comparison's fields of the same meaning, with units converted (600 mm → 60 cm); width,
  height, depth and weight get their own field when there is none yet; other data-sheet lines
  are kept under "Imported extras". Only empty fields are filled, and Propario says what it took.
  This also works when the page has no usable picture.
- New products name whoever added them under "Found by".
## 0.3.0 — 2026-11-18

- **Check elsewhere:** each product links to Geizhals, idealo, Amazon and Stiftung Warentest,
  and its shop to Trustpilot – by GTIN when known, otherwise by brand and model. The links go
  straight to those sites; Propario fetches nothing and adds no tracking or affiliate codes.
- **Offers:** several shops per product with price, shipping, date and link. The cheapest total
  becomes the product's price, its date and shop – so requirements on the price, sorting and
  "cheapest" keep working.
- **Tests & reviews:** ratings from Stiftung Warentest, ÖKO-TEST, Amazon, idealo, Trustpilot or
  any other source, entered by hand, converted to 0–100 and shown per source and as a plain
  average; product and shop ratings stay apart.
- **Fit:** a weighted share of the met soft requirements (important 3, wish 2, bonus 1, avoid 2)
  as a sortable column and in the side-by-side view. Must criteria stay filters; unknown values
  do not count against a product.
- Products have a **GTIN/EAN** and a **manufacturer part number**, taken from the shop page when
  the picture is fetched; Excel import and export know both columns.
- Prices carry the date they were set; prices older than a week are marked.
- **Return and warranty dates** for bought products, suggested from the purchase date (14 days,
  2 years); open return deadlines show on the start page.
- **Swipe mode:** go through a comparison one product at a time – like it or not. Everyone votes
  for themselves; the votes appear as a column in the table.
- A calmer, more compact comparison page: name and category in the top bar, the stage as a small
  menu next to the tabs, "+ Product" opens the quick entry, export in the ⋯ menu, the language
  in Settings.
- Columns move by dragging their header sideways (or Alt+←/→); rows move by their handle (or the
  arrow keys on it).
- Clicking a product's name opens its details; the shop page opens with the ↗ button.
- Excel import fetches the product pictures right away, where the shops allow it; tall pictures
  stay inside their box.

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
