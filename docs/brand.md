# Propario – vision, mission and design guide

The short version of what Propario wants to be and how it looks and speaks. Read it before
changing the interface, its texts or the logo. When something here and the code disagree, fix
one of them.

## Vision

**Every bigger purchase becomes a good decision – on your own or together – without spreadsheet
chaos, without advertising, and without anyone else owning your data.**

## Mission

**Propario turns scattered links, data sheets and opinions into one clear comparison: set your
requirements, compare the candidates quickly and calmly, and decide – alone or with the people
it concerns. Self-hosted, private, fast and accessible – and with as little effort as possible.**

## What we hold to

1. **Real problems first.** A feature exists because someone deciding a purchase needs it, not
   because it is possible. Fewer, better things.
2. **Calm over clever.** The interface shows facts and lets people judge. No dark patterns, no
   nudging, no gamification, no affiliate links.
3. **Private by default.** Data stays on the instance, encrypted at rest, shared only on purpose.
   No third-party scripts, fonts or tracking ([SECURITY.md](../SECURITY.md)).
4. **Quality you can check.** Every change is tested; accessibility (WCAG 2.1 AA) is tested
   automatically; nothing is "done" before `npm run verify` passes.
5. **Simple to run and to read** (KISS). One small server, one database, no services around it.

## Brand

- **Name:** Propario – a blend of the Latin _productum_ (product) and _comparare_ (to compare).
  Written with a capital P, never in capitals, never with a tagline glued to it.
- **Line:** _Compare faster, decide better._ The same words everywhere – the start page's title,
  the README, the website, the app's manifest; translations take theirs from
  `overview.title` in their language file.
- **Character:** a well-made tool – precise, calm, friendly, a little warm. It feels like a
  good workbench, not like a shop and not like a finance app.

### Logo

A **P whose bowl is a magnifying glass**: looking closely before deciding. The handle is set
apart in amber – the find.

- One drawing for everything: [`scripts/icons.ts`](../scripts/icons.ts) writes the favicon
  (also shown in the top bar) and all app icons. Change the logo there, never by hand.
- Always on its petrol tile; the P is white, the handle amber, starting right at the ring.
- Do not recolour, outline, rotate, add effects or put text inside the tile. Minimum size 16 px.
- Next to the name the tile stands left of "Propario", set in the display face.

## Colour

Two colours carry the brand, exactly as in the logo. The tokens live in
[`src/styles/app.css`](../src/styles/app.css) for light and dark; components use tokens only,
never hex values (exceptions: pictures sit on white, the gallery is always dark).

| Role                  | Token                                    | Light     | Dark      | Used for                                                                          |
| --------------------- | ---------------------------------------- | --------- | --------- | --------------------------------------------------------------------------------- |
| **Petrol** – Propario | `--brand`                                | `#1f7a80` | `#5cbcc1` | primary buttons, where you are (navigation, steps), active filters, the shortlist |
| **Amber** – the find  | `--accent`                               | `#f2b33d` | `#f2b33d` | the decision, what is new, what differs, what needs a look                        |
| Met / not met / open  | `--pass`, `--fail`, `--unknown`          |           |           | only the result of a requirement check (and destructive actions for red)          |
| Neutrals              | `--bg` … `--ink`, slightly petrol-tinted |           |           | everything else                                                                   |

Rules:

- **Petrol acts, amber points out.** If it can be clicked to do something, it is petrol. If it
  marks something as special, it is amber. Never both on one element.
- **Amber is rare.** At most a few amber marks per screen; amber text uses `--accent-text`,
  text on amber uses `--accent-ink`.
- **Green, red and grey mean met, not met, unknown.** Red also marks a thumb down: both speak
  against a product. Missing data is grey, never red. A thumb up is petrol, neutral grey; a
  favourite is a petrol star.
- **Contrast:** text at least 4.5 : 1, icons and lines that carry meaning at least 3 : 1, in
  both themes. Check new colour pairs before using them.
- Light, dark and "like the device" are equal; design and check both.

## Type

- **Bricolage Grotesque** (display): page and section titles, the name, big numbers. Bold,
  used sparingly.
- **Public Sans** (interface): everything else; tabular figures where numbers line up.
- Both are served from the instance, never from a font service. No third face.

## Shape, space, imagery

- Radius 10 px for surfaces, 6–8 px for controls, round only for dots and avatars.
- Borders separate, shadows only for things that float (menus, dialogs, the drawer).
- Touch targets 44 px; generous white space over extra lines and boxes.
- Product pictures are the stars: on white, uncropped, never tinted.
- The demo's pictures are drawn by [`scripts/demo-pictures.ts`](../scripts/demo-pictures.ts):
  invented products as studio shots in vector – no photo of a real product is shipped. Change
  them there, never in the SVGs.
- Icons are our own simple line glyphs ([`src/ui/Glyph.tsx`](../src/ui/Glyph.tsx)); no icon
  library, no emoji as icons.
- The README's pictures ([`scripts/readme-art.ts`](../scripts/readme-art.ts)) may use fuller
  symbols – our own drawings on a 24 grid with stroke 2 and round ends; never copied from an icon
  set (that would need its license notice). A README stands on its own; the app keeps its glyphs.
  Change them there, never in the SVGs.

## Patterns

Where things go, so a new screen looks like the others without deciding it again.

**Actions**

- **One main action in sight.** A bar, a card or a row shows the one action most people come for
  (petrol). Everything else goes into ⋯ ([`src/ui/Menu.tsx`](../src/ui/Menu.tsx)). Examples: the
  comparison's top bar, a comparison's card, the selection bar.
- **Order in a ⋯ menu:** the usual actions first, then Export (one entry that opens its formats,
  [`src/ui/ExportChoice.tsx`](../src/ui/ExportChoice.tsx)), then a line, then Delete in red as the
  last entry. Delete always asks first.
- **Closing or clearing is a ✕ at the end** of its bar, or at the top right of a drawer or panel.
- **Only what can be done is offered.** An action that is impossible right now is hidden (a viewer
  sees no Delete); one that needs one more step stays visible but disabled (Compare with one
  product selected).

**Symbols and labels**

- **One symbol, one meaning,** everywhere: a balance compares side by side, crossed swords start a
  duel, ⋯ holds more, ✕ closes, clears or takes an entry out of a list, a funnel filters, the
  columns symbol chooses columns, the bin deletes something for good. A new meaning gets a new glyph in [`src/ui/Glyph.tsx`](../src/ui/Glyph.tsx), never
  a symbol already in use.
- **A button with only a symbol still has a name:** `aria-label` and `title` with the same words
  the wide screen shows (`hide-narrow` hides only the visible text). The accessible name contains
  the visible text, so voice control finds it.
- **On a phone, buttons in a bar show their symbol only;** on a wide screen the main action shows
  its words too. Menu entries always have symbol and words.

**Menus, bars and dialogs**

- **A menu never gets cut off.** Inside something that clips (a card, a table cell, a bar at the
  bottom) it opens `floating`; it then opens where it fits and scrolls if it is taller than the
  room.
- **A bar that appears with a selection** floats at the bottom, says how many are selected and
  shows progress in place of that count while something runs.
- **Text in a menu is ordinary text,** whatever the colour of the bar it opens from.

**Phone (up to 600 px)**

- Touch targets 44 px, the toolbar in one row, the page never scrolls sideways.
- A table may scroll sideways inside its box. Its first columns stay; the product column folds to
  its pictures while the table is scrolled.
- Room goes to the data: tables run from edge to edge, headers stay short.
- Anything positioned inside a scrolling box (screen-reader texts included) has a positioned
  ancestor inside that box, or it stretches the page.

## Voice

- Plain, short, friendly. Say what happens: "Add product", "3 added, 1 updated".
- **Like a person writes, not like a generator.** Concrete over grand: a real purchase, a real
  annoyance (the spreadsheet, the thousand tabs). Commas, colons and full stops, no dashes as
  punctuation in what people read first (start page, README, website). They make a text look
  machine-written. A dash stays where it means "none" in a table or a range like 10–15.
- **Languages:** English is the source – of every text (`src/i18n/en.ts`), the docs and the code.
  German is the first translation (`src/i18n/de.ts`) and addresses people informally.
- Name things as people know them: _comparison_, _product_, _requirement_ – not the code's
  words ([GLOSSARY.md](../GLOSSARY.md)).
- **One action, one name.** The same action has the same label and symbol wherever it appears –
  "Update details" in the details and for several products, "Duplicate", "Delete", "Add
  picture". People recognise it at once, and one text key means one place to change:
  reuse the existing key (`common.*` for actions found in several places) instead of adding a
  second one with the same words. Buttons of one bar share one style.
- Errors say what went wrong and what to do. No blame, no exclamation marks, no jokes in
  error messages.
- Never claim more than we know: a guess is shown as a guess, missing data as missing.

## Checklist for a change people see

- [ ] Solves a real problem; nothing added that is not needed.
- [ ] Uses tokens; petrol acts, amber points out; check colours only for checks.
- [ ] Follows the patterns: one main action in sight, the rest in ⋯, symbols keep their meaning.
- [ ] Light and dark, 390 px and desktop, English and German looked at.
- [ ] Keyboard, screen reader labels and contrast fine (`npm run verify` runs axe).
- [ ] Texts plain and in both languages; an action that exists elsewhere uses its label and key.
- [ ] A line in `CHANGELOG.md`.
