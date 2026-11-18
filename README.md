# Propario

**Compare products together, and decide.** A calm place for the comparisons that otherwise live
in spreadsheets: the kitchen cabinet, the notebook, the bike – with your requirements, the
candidates, their pictures, your ratings and the final decision.

> **Status:** early, usable. Self-hosted web app, free software (AGPL-3.0). Built first for a
> household comparing purchases together; contributions are welcome (see
> [CONTRIBUTING.md](CONTRIBUTING.md)).

## What it does

- **One comparison per purchase**, each with its own **fields** (columns with types and units),
  **requirements** (must / important / wish / bonus / exclusion / avoid / info) and **products**.
- **A table like a spreadsheet**: inline editing, sorting, filtering, column widths and
  visibility, price differences, and a requirement check per product – green met, red not met,
  grey unknown. Missing data never counts as a failure.
- **Pictures**: paste a shop link and Propario fetches the product picture once and keeps a
  small copy. A thumbnail sits in front of each name and grows on hover. Shops that refuse
  automated access are respected; paste or drop the picture instead.
- **Check elsewhere**: links to price comparisons (Geizhals, idealo), Amazon, Stiftung Warentest
  and the shop on Trustpilot – by GTIN when known. No tracking or affiliate codes.
- **Offers and outside ratings**: several shops per product (the cheapest total is the price),
  and ratings from tests and reviews, converted to one scale; product and shop kept apart.
  Entered by hand – Propario fetches no prices or ratings.
- **Fit**: requirements weighted by priority, prices with the date they were seen.
- **Side by side**: selected products next to each other, differences highlighted.
- **Decide together**: favourites, exclusion reasons, star ratings and notes per person, pros and
  cons, the final decision and the purchase.
- **Private by default, shared on purpose**: a comparison belongs to whoever created it and can
  be shared with other people on the instance – to view or to edit.
- **Excel import** with a preview and a correctable column mapping; Excel and JSON export;
  complete backups including pictures.
- **English and German**; light, dark or like the device; built for WCAG 2.1 AA.

## What it deliberately does not do

- No passwords and no e-mail addresses. You sign in with a **passkey** (fingerprint, face or
  device PIN). New people join only with an invitation.
- No tracking, no analytics, no third-party scripts or fonts. Pages show pictures from this
  server only, so no shop learns who is looking.
- No crawling. A product page is read once when you add it by link or ask for its picture: its
  preview image and what it states about the product (name, brand, category, GTIN, part
  number, euro price, data sheet; schema.org, Open Graph, data-sheet tables), nothing else; no
  disguised client, no getting past bot walls. It fills only empty fields.
- Links to other sites (price comparisons, tests) are built in your browser and open there
  directly; this server never contacts them.

## Try it on your computer

Requires Node.js 22.18 or newer (24 recommended).

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. The terminal shows a **one-time setup link**: open it, choose a
name, create your passkey. The first account looks after the instance and invites others.
Development data lives in `./data/` (git-ignored).

## Host it yourself

```sh
echo "DATA_KEY=$(openssl rand -base64 32)" >> .env   # once; keep a copy apart from backups
docker compose up -d
docker compose logs app        # shows the one-time setup link
```

`DATA_KEY` encrypts every comparison, picture and personal setting at rest (AES-256-GCM). Without
it the server does not start; if it is lost, the data cannot be read any more.

The container listens on `127.0.0.1:8080` only. Put it behind a reverse proxy with HTTPS
(Traefik, Caddy, nginx) and set the public address once:

```sh
ORIGIN=https://propario.example.org
ADDRESS_HEADER=X-Forwarded-For   # so rate limits apply per visitor, not to the proxy
XFF_DEPTH=1
```

> **Choose the address once.** Passkeys are bound to the domain they were created on, and
> browsers require HTTPS for them (only `localhost` may use plain http). If the address changes,
> existing passkeys stop working and everyone needs their recovery key.

**Private instance (VPN, invitation only).** Propario needs no public exposure: route the
hostname only inside your VPN, keep a valid certificate (for example via a DNS challenge), and
invite people under _Settings → People on this instance_. Each invitation link works once and
expires after 14 days.

### Configuration

| Variable               | Default                             | Meaning                                                                        |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `ORIGIN`               | — (required in production)          | Public address, e.g. `https://propario.example.org`. Passkeys are bound to it. |
| `DATA_KEY`             | — (required in production)          | 32 random bytes in base64 (`openssl rand -base64 32`). Encrypts all content.   |
| `DATA_DIR`             | `/data` (container), `./data` (dev) | Where the SQLite database lives.                                               |
| `PORT`, `HOST`         | `8080`, `0.0.0.0`                   | Listen address inside the container.                                           |
| `ADDRESS_HEADER`       | —                                   | Header with the visitor's address behind a trusted proxy (`X-Forwarded-For`).  |
| `XFF_DEPTH`            | `1`                                 | Which entry of that header to trust, counted from the right.                   |
| `PROPARIO_IMAGE_FETCH` | `on`                                | `off` stops the server from fetching product pages for pictures.               |

### Backups and updates

- **Server:** `docker compose exec app node server/backup.ts` writes a consistent snapshot to
  `/data/backups/`. Copy it off the machine; keep `DATA_KEY` somewhere else.
- **Personal:** _Backup → Download backup_ saves everything you can see, pictures included, as
  one JSON file that restores on any Propario instance.
- **Locked out:** if someone has lost every passkey and their recovery key,
  `docker compose exec app node server/recovery-key.ts "Display name"` issues a new recovery
  key (the old one stops working). Hand it over in person.
- **Update:** `git pull && docker compose up -d --build`. The database migrates itself on start;
  take a snapshot first.

### Coming from version 0.1

Version 0.1 kept everything in the browser. After signing in, _Backup_ offers to move those
comparisons into your account.

## Excel import

_Import_ → choose an `.xlsx`. Each sheet becomes a comparison. The wizard shows the detected
header row, the mapping of every column, the requirements and notes found below the product
rows, and a product preview. Everything can be corrected before importing. Nothing is silently
dropped: unknown columns become custom fields, values that do not fit are kept as text.
Details: [docs/excel-import.md](docs/excel-import.md).

## Development

```sh
npm run verify       # format check, types, unit tests, the whole story in a real browser
npm test             # unit and integration tests (server logic on in-memory SQLite)
npm run test:e2e     # builds, starts the production server, runs e2e/ with passkeys and axe
```

Once per clone: `pre-commit install --hook-type pre-commit --hook-type pre-push`. Every commit
then runs gitleaks and `scripts/check-repo-policy.sh` (no databases, workbooks, exports or
`private/`; plus any terms you list in the git-ignored `private/denylist.txt`); every push runs
`npm run verify`.

```
server/        Node server: API, passkeys, sessions, access rules, sync, images (TypeScript run by Node directly)
src/shared/    record shapes, validation and merge rules used by both sides
src/db/        browser cache (Dexie), repository functions, backups
src/sync.ts    keeps the browser cache in step with the server
src/domain/    value parsing, requirement evaluation, display helpers
src/import/    Excel analysis and import (SheetJS)
src/pages/     screens; src/pages/project/ holds table, drawer and tabs
src/i18n/      en.ts (source) and de.ts – TypeScript enforces complete translations
e2e/           the end-to-end story (Playwright, virtual passkeys, axe)
```

Check the shop-page import against your own data, without any AI: one page per shop, the
app's own guarded client, compared with the values your products hold (never commit backup or
report):

```sh
node --disable-warning=ExperimentalWarning scripts/check-shop-pages.ts /path/to/propario-backup.json
```

Optional check against your own workbooks (never commit them):

```sh
PV_XLSX="/path/a.xlsx:/path/b.xlsx" PV_VERBOSE=1 npx vitest run tests/real-files.test.ts
```

## Versions and releases

Every release has a number, an annotated tag and an entry in [CHANGELOG.md](CHANGELOG.md).

- **Which version is running?** Under _Settings_, e.g. `0.2.0+4d837a1`: the release plus the
  commit it was built from. Open pages notice a newer server and offer to reload.
- **Deploying:** deploy `main`. What is on `main` has passed `npm run verify` (the pre-push hook
  runs it).
- **Not every change is a release.** Changes collect under _Unreleased_ in `CHANGELOG.md` and
  reach people as soon as `main` is deployed. A release bundles them when the set is worth
  announcing – about once a month, not per feature.
- **Making a release:** raise the middle number in `package.json` (the last number only for a
  fix to a release), turn _Unreleased_ into the release's dated entry, add at most four short
  lines per language to `src/releases.ts` – people see them once after the update unless they
  turned it off under _Settings_ – commit, then `git tag -a v0.x.y -m v0.x.y` and
  `git push --follow-tags`. 1.0 is a deliberate decision, not a count.
- Container builds have no Git history; pass the commit as build argument `PROPARIO_COMMIT`
  so the version shows it.

## Security

See [SECURITY.md](SECURITY.md) for the baseline and how to report a vulnerability.

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version as a service, its users are
entitled to its source.

---

## Deutsch: Kurzanleitung

1. **Starten:** `npm ci && npm run dev`, dann den Einrichtungslink aus dem Terminal öffnen, Namen
   wählen, Passkey erstellen. Im Container: `.env` mit `DATA_KEY` anlegen, `docker compose up -d`,
   Link aus `docker compose logs app`.
2. **Einladen:** _Einstellungen → Personen auf dieser Instanz → Einladung erstellen_, Link
   weitergeben. Jeder Link gilt einmal und 14 Tage.
3. **Teilen:** Im Vergleich auf _Vergleich teilen_ – pro Person _Darf ansehen_ oder _Darf bearbeiten_.
4. **Import:** _Import_ → `.xlsx` wählen, Zuordnungen prüfen, importieren. Bilder über
   _Bilder laden_ oder per Einfügen im Produkt.
5. **Sichern:** Server-Snapshot mit `docker compose exec app node server/backup.ts`; persönliche
   Sicherung unter _Sicherung_. `DATA_KEY` getrennt davon aufbewahren.
