# Changelog

What each version can do. Newest first. Versions follow [Semantic Versioning](https://semver.org):
while Propario is 0.x, the middle number goes up for new features or changed behaviour, the last
for fixes. See "Versions and releases" in the README.

## Unreleased

## 0.12.1 — 2026-11-19

- Changed back: the fit has its own column again, and the verdicts too – the rows were too
  tall. The thumb down stays red.
- Added: verdicts are set right in the table – 👍 ⊖ 👎 with how many gave each; one's own is
  marked, a tap sets it or takes it back. The column shows by default.

## 0.12.0 — 2026-11-19

- Changed: the fit moved into the requirements column, under the bars – "Fit 86 % · 3 open" – and
  a product that fails a must says "Must not met" there instead of a percentage that looked
  good. The separate fit column is gone.
- Changed: everyone's verdicts show in the table, under each product's status; a thumb down is
  red, apart from neutral.

- Fixed: adding a product by a link whose shop refuses automated access (Otto answers with a
  bot check) gave no word at all. The app now says why nothing came, and takes what the address
  itself names – the product name and, as in Otto's addresses, width, depth and height – without
  any further request. Only empty fields are filled.

- Changed: **one way to judge a product.** The selection is now _Open_, _Checked_ or
  _Excluded_; a favourite is a star of its own; and everyone gives their verdict – thumbs up,
  neutral or thumbs down – in the details, by swiping or with ↓ for neutral. Giving a verdict
  marks an open product as checked. The separate star ratings per person are gone; ratings
  from an import stay readable in the details. Old favourites read as checked with the star.
- Changed: in the details the shop link sits prominently under the picture, the price shows
  its €, "Update details" and "Final decision" are shorter, and explanations sit behind a quiet
  ⓘ (on hover or focus) instead of under each label.
- Changed: "Check elsewhere" is gone – Geizhals, idealo and Amazon are searched from the
  offers, Stiftung Warentest and Trustpilot from tests & reviews; their texts are shorter.

## 0.11.0 — 2026-11-19

- Changed: in the requirements and the fields, the handle for moving a row sits first in the
  row, where it is picked up.

- Added: **Troubleshooting** in Settings – a detailed log on this device (requests with status
  and duration, saving and syncing, start steps, errors, going to the background, network and
  app-file changes; the last 400 entries, kept across updates) and a **support package** to
  download: version, device, installed or not, service worker, caches, the browser's
  databases, storage, record counts and the log – no contents of comparisons. The error pages
  offer the package too, and with the log on, reports in the server log carry its last lines.

- Fixed: Propario could hang for good while starting, at "opening the data stored in this
  browser" (the server log showed it). A browser database cannot open while its removal is
  pending, and the removal waits for every other window – an installed app frozen in the
  background may never let go. If this browser's copy does not open within 5 seconds, a fresh
  one is used and the data comes again from the server; removing a copy never blocks a start.
- Changed: **Fields** are a compact table like the requirements: name, type, unit, how values
  compare or the choices of a selection, how many products have a value; edited in place,
  moved by their handle (drag or ↑ ↓), the same way as requirements.
- Fixed: an empty scroll bar showed beside the tabs of a comparison on desktop.

- Changed: the app no longer waits for the server before it shows a change. A change appears
  at once and is saved in the background; if it cannot be saved (no connection, refused), it is
  taken back and the app says so. "Saving …" shows when it takes a moment. On a phone whose
  connection needs seconds after waking up, the app felt stuck – above all when swiping, where
  each card waited for the last vote to be saved.
- Added: **your verdict in the details** – the same "Like" / "Not for us" as when swiping,
  changeable there, so a swipe in the wrong direction can be put right; others' verdicts are
  named next to it.
- Changed: the free-text fields of a product say what belongs in them (description, price
  note, overall impression, pros and cons, comments, purchase note), and each person's rating
  note is labelled. "Notes" duplicated "Comments" and is retired: it only shows while it still
  holds text, with a button to move that into the comments.
- Fixed: restoring a backup lost its pictures – the app's own Content-Security-Policy refused
  how they were read.
- Added: a save that takes longer than 15 seconds is reported to the server log
  (`[client] … kind=slow`), to tell connection problems from others.

## 0.10.0 — 2026-11-19

- Added: **What Propario can do** – the start page for visitors (with the sign-in in its
  opening) and a page in the menu: the way to a decision in four steps, each with a small piece
  of the real interface, plus working with your AI and what keeps the data private.
- Added: **Demo** – an invented sideboard comparison with six candidates, pictures and a
  dimension drawing, to try everything without an account. It runs entirely in the browser
  tab: no change and no request reaches the server's data, what needs a server says so, and
  ending the demo (or closing the tab) removes it.
- Fixed: empty cells in the ratings and purchase columns had no name for screen readers.

## 0.9.3 — 2026-11-19

- Fixed: a browser whose storage stopped answering kept Propario blank – the service worker
  waited for it on every app file. It now falls back to the network after two seconds, never
  delays an answer to store a copy, and its own updates no longer wait for a hanging storage.
- Fixed: "Reset this browser" stayed at "Resetting …". The browser now does the reset itself
  (`Clear-Site-Data`, the sign-in stays), and the page checks the result and says clearly
  whether it worked – and what to do if not. It and the error page speak one language, the
  person's, instead of German and English together.
- Fixed: in the gallery, upright pictures – above all further ones, which are stored larger –
  were cut off, especially on a laptop. Every picture now fits whole; the magnifier enlarges
  around the tapped spot and keeps the picture centred instead of moving it to the left.

## 0.9.2 — 2026-11-19

- Fixed: a start that hangs no longer leaves a blank page forever. After 10 seconds Propario
  says which step it hangs at – checking the sign-in, opening the data stored in the browser,
  loading the data – with a reference; a failing server is shown as that instead of the
  sign-in page; requests give up after 30 seconds.
- Added: **Reset this browser** (`/reset.html`), linked from every error page and shown even
  when the app's code does not load: it removes Propario's copy in this browser – cached data,
  app files, service worker – and keeps the sign-in.
- Added: errors and hangs in the browser are reported to the server log with the same reference
  as on screen (`[client] ref=…`), without contents of comparisons.

## 0.9.1 — 2026-11-19

- Changed: in the logo, the magnifying glass's handle now starts right at the ring.
- Fixed: the installed app on Android could show a blank page after an update – the old
  version kept running and failed to load parts that were gone. Coming back to the app, it now
  reloads when a newer version runs; if loading a part fails anyway, it reloads once; anything
  else that breaks shows a page with "Reload" instead of nothing.

## 0.9.0 — 2026-11-19

- **Add or update products** (⋯ in a comparison): paste a table – your AI's answer, rows copied
  from Excel, CSV or Markdown – or choose a file (.xlsx, .csv, .md, .txt, .json). Rows already in
  the comparison (same link, GTIN or name) update their product, the others are added; new
  columns can become fields. A preview shows every change, and only what stays ticked is saved.
  Empty cells clear nothing; comments and pros/cons are added to, not replaced.
- **Round trip with your AI:** "Copy for my AI" ends with the products as a table and asks the
  AI to answer in it, so its suggestions can be pasted straight back.
- **More formats:** the table import for a new comparison also reads CSV, Markdown, text and JSON.
- **New logo:** a P whose bowl is a magnifying glass, in petrol with an amber handle – in the
  favicon, the app icons and the top bar. It stands out on dark tabs and home screens.
  `scripts/icons.ts` draws all icons from one source.
- **One colour concept**, taken from the logo: petrol for actions, where you are and the
  shortlist; amber for the decision, stars, new entries and differences; green, red and grey
  only for requirement checks. Neutrals are tinted to match, in light and dark. Vision, mission
  and the design guide are in `docs/brand.md`.
- Fixed: swiping in the gallery stepped to another product instead of the next picture.

## 0.8.0 — 2026-11-19

- **Further pictures:** up to eight per product besides the main one – added by file, by pasting
  or dropping onto the picture, or from the shop page: when a picture is loaded (or the product
  is updated from its page), a second one from the page's gallery is kept – a dimension drawing
  when there is one: named so in its address, or recognised without AI by its pixels (mostly
  white, thin lines, little colour, no shading) among the last three pictures, where shops tend
  to put it. Further pictures are stored a little larger, so figures stay legible, and travel
  with backups.
- **Gallery:** a click or tap on the product picture opens all pictures full screen, starting
  with the main one; ‹ ›, the arrow keys, a swipe or the thumbnails step through them, and a tap
  shows a picture at full size – also how a phone zooms in. The first picture is the main one,
  marked with a star; the gallery's star makes another one the main picture (it moves to the
  front). Removing the main picture lets the next one take its place.
- **Step through products in the details:** ‹ › in the header, the arrow keys or a swipe on a
  phone move to the previous or next product, in the table's order with its filter and sorting.
- **Only products still in the running by default:** the quick filter "Only eligible" is on
  unless switched off, so excluded products and those failing a must criterion do not distract.
- Fixed: Escape in a dialog opened from the details (the gallery) closed the details too.

## 0.7.0 — 2026-11-18

- **Requirements as a table**, like the products: one compact row per requirement – priority,
  requirement, weight, automatic check, category, details – with fields that look like cells and
  groups as slim rows. Far more fits on the screen; on phones priority and requirement stay in
  view while the rest scrolls sideways.
- **Budget, like a requirement:** at most and – optionally – at least, each with its own
  priority (at most is a must unless chosen otherwise, at least is important), as the first
  group of the table. Both count in the checks, the must count and the fit like any rule; the
  price says "€46 below the minimum".
- **Own price rules into the budget** with one click: "Budget ≤ 800" from an Excel import becomes
  the budget's maximum with its priority, and the rule is removed.
- **Weights visible:** each requirement shows how much it counts – "Filter" for must and
  exclusion, otherwise its weight and its share of the fit ("2 · 25 %").
- **A missing field, created from the requirement:** "Maximale Tiefe 40 cm" offers "New field
  Tiefe (cm)" and sets the check to Tiefe ≤ 40 right away.
- **Requirements move by dragging their handle** (or the arrow keys on it), also into another
  group, which they then join.

## 0.6.0 — 2026-11-18

- **Install as an app:** a web app manifest, app icons (also maskable and monochrome for
  Android) and a small service worker, so Android offers "Install app"
  and iOS "Add to Home Screen". The worker keeps only the app's versioned files – never pages,
  data or pictures – and shows a friendly page when the server cannot be reached, e.g. outside
  the VPN.
- **Share → Propario:** with the app installed, a product link shared from a shop app or the
  browser lands in Propario; you pick the comparison, it is added – or the existing entry opens
  when the link is already there – and picture and data follow from the shop page.
- **Phones:** the quick filters fold away behind one "Filter" button that counts the active
  filters; the fixed columns are narrower, so more columns stay in view in portrait; search,
  filter and columns share one line.
- **Copy for my AI** (⋯ menu of a comparison): requirements, budget and every product with
  price, fields, verdicts, ratings and notes as text with a question, for the AI you use – no
  key, nothing sent by Propario, no names of people.
- The selection opens as a small menu of coloured pills – open grey, favourite green, excluded
  red; excluded rows get a faint red wash.
- **"3 new"** on a comparison's card opens its table filtered to the new products.
- **Locked out?** Whoever runs the server can issue a new recovery key with
  `node server/recovery-key.ts "Name"`; the old key stops working.
- The product notes field says what it is: seen by everyone in the comparison (it read
  "Personal notes").
- The picture in the details also grows when it appears under a resting mouse pointer.

## 0.5.0 — 2026-11-18

- **Budget:** every comparison has one (Requirements tab). It counts as a must criterion for
  every product – price ≤ budget – with tinted price cells, filters and the must count, without
  writing a rule.
- **Price reference:** the price column no longer just measures against the cheapest product. It
  says "€50 under budget" or "€120 over budget", or – once a product is chosen as price reference
  in its details – how much more or less each product costs than that one.
- **Side by side, at a glance:** in every row of numbers the best value is green and the worst
  red, the others show their distance to the best ("+€96 to the best"). Lower prices and higher
  ratings, fit and test scores are better; for a field, its new setting "Smaller/Larger is
  better" or its requirement rule decides. Fields without a direction show where each value lies
  between the smallest and the largest. Yes/no shows ✓ and ✕.
- More products join the side-by-side view with "+ Product".
- Excluded products are set in italics in the table and side by side.
- Fixed: the price cell told screen readers less than it shows.

## 0.4.1 — 2026-11-18

- **Update from the shop page:** a clear button in the product details reads the product page
  again, shows what it would add – empty fields, a changed price, a missing picture – and takes
  it after a yes. Before, "Load again" only fetched the picture file, never the page, so later
  improvements of the import could not reach existing products.
- **No duplicates:** adding a link that is already in the comparison (also with www, a trailing
  slash or tracking parameters) makes no second entry; the existing one opens and Propario offers
  what the page adds.
- **Selected products** can be updated from their shop pages in one go (one page after the other,
  with a summary of changed prices) or deleted – after asking twice.
- The picture buttons say what they do: "Load picture from shop page", "Choose picture file".
- Products known only by their link are named by the shop's address everywhere, also for screen
  readers.

## 0.4.0 — 2026-11-18

- **More from the shop page, without AI:** adding a product by link also takes its name, brand,
  kind of product, colour, description and data sheet – from structured data, microdata,
  data-sheet tables and dimensions named in the text. Lines go into the comparison's fields of
  the same meaning, units converted (600 mm → 60 cm); width, height, depth and weight get their
  own field when there is none yet; other lines are kept under "Imported extras". Only empty
  fields are filled, and Propario says what it took. Pages that contradict themselves get no
  dimension rather than a wrong one.
- **Filters:** quick chips (favourites, new, found by me, only eligible, hide excluded) and an
  advanced query for any field in the spirit of Jira's JQL – `Width <= 90 AND (Colour ~ green
  OR Price < 800)` – in English or German, with explained mistakes. The filter is part of the
  address, so a filtered view can be reloaded and shared.
- **Requirements in their column:** a rule such as "Depth ≤ 40" tints the depth cells green or
  red with a quiet ✓ or ✕; the header shows `*`, the rule as tooltip, and filters by it on
  click. Values stay as they are for sorting and filtering.
- The requirements column shows two bars, must criteria above the others, each with its count.
- Yes/no fields show ✓ and ✕ instead of words.
- **Exclusion reasons** as a choice – looks, size, price, brand, shop, quality, other – plus
  optional details; filterable (`Reason = size`).
- **Found by** is filled in with whoever adds a product; a **Found on** column shows when;
  entries of the last three days get a blue stripe. Favourites are dark green.
- Double-click a column's edge to fit its width to header and values.
- The product picture in the details grows on hover, keyboard focus or tap.
- Fixed: number cells told screen readers the bare number instead of what is shown; a unit
  typed for one number field no longer sticks to the next field of another type.

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
