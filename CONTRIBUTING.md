# Contributing

Thank you for helping. Propario is small on purpose; this page explains what keeps it that way
and everything you need to work on the code.

- [Principles](#principles-in-order)
- [Before you start](#before-you-start)
- [Set up](#set-up)
- [How the code is organised](#how-the-code-is-organised)
- [Rules that keep it right](#rules-that-keep-it-right)
- [Tests and checks](#tests-and-checks)
- [Pull requests](#pull-requests)
- [Releases](#releases)

## Principles, in order

1. **KISS.** The simplest thing a person can read, review and operate. No new dependency,
   service, abstraction or setting without a concrete problem it solves.
2. **Security and privacy by design.** Private by default, shared on purpose. [SECURITY.md](SECURITY.md)
   is the baseline and every change keeps it true. When a change touches personal data, answer
   first: do we need to store it, can we store less, and is it encrypted, exported and deleted
   with the account?
3. **Think big, build small.** Do not block the future (more languages, other storage, more
   people), but build only what is needed now.

What Propario wants to be, and how it looks and speaks: [docs/brand.md](docs/brand.md).

## Before you start

- For anything larger than a fix, open an issue or a discussion first and describe the problem.
  That saves you work if it does not fit.
- Never put personal data into issues, commits or tests: no real names, workbooks, exports or
  screenshots of private comparisons. Test fixtures use invented people and products.

## Set up

```sh
nvm use            # the Node.js version in .nvmrc (fnm use works too)
npm ci
pre-commit install --hook-type pre-commit --hook-type pre-push
npm run dev        # http://localhost:5173; the terminal shows the one-time setup link
```

Development data lives in `./data/` (git-ignored) and is **encrypted as in production**: on the
first start `npm run dev` makes a key and keeps it in `.dev-data-key` (git-ignored, readable
only by you), and uses it every time after. Keep that file; without it `./data/` cannot be read.
To open data from a production backup, start with its key: `DATA_KEY=… npm run dev`. Never use
`DATA_KEY=$(openssl rand -base64 32) npm run dev`: that makes a new key on every start, and the
server then refuses `./data/` with a message saying so. There is no unencrypted mode. To start
over, move `./data/` aside.

The hooks run on every commit: gitleaks and `scripts/check-repo-policy.sh` (no databases,
workbooks, exports or `private/`, plus any terms you list, one per line, in the git-ignored
`private/denylist.txt`). Before every push they check all outgoing commits, messages and tags
the same way and run `npm run verify`.

**One Node.js version**, set in `.nvmrc`: CI reads it, `engines` in `package.json` and the
Dockerfile follow it, and a test checks that they agree. When Dependabot raises the Node image,
raise `.nvmrc` and `engines` in the same pull request.

## How the code is organised

```
server/        Node server: HTTP, passkeys, sessions, access rules, sync, pictures
               (plain TypeScript that Node runs directly)
src/shared/    record shapes, validation and merge rules used by browser and server
src/db/        browser cache (Dexie), repository functions, backups
src/sync.ts    every change: shown at once, sent to the server, taken back if refused
src/domain/    value parsing, requirement checks, filters, duels, display helpers
src/import/    Excel and table import (SheetJS)
src/pages/     screens; src/pages/project/ holds the table, the details and the tabs
src/i18n/      en.ts (source) and de.ts – TypeScript enforces complete translations
src/demo.ts    the demo: invented comparisons that never reach the server
e2e/           the end-to-end story (Playwright, virtual passkeys, axe), the website's demo, the screenshots
docs/          user guide, self-hosting, import rules, design guide, pictures
site/          the website (GitHub Pages)
```

Words: the interface says _comparison_, the code says `project` ([GLOSSARY.md](GLOSSARY.md)).

## Rules that keep it right

- `server/` runs as plain TypeScript: erasable syntax only, relative imports with `.ts`.
- Every function that crosses user boundaries takes the acting person's id and checks the role
  itself (`projectRole`, `requireRole` in `server/store.ts`); "not found" is also the answer for
  "not yours". Changes to who may see or change what need a test in `server/access.test.ts`.
- Every input is checked in `src/shared/records.ts` before it reaches the database. Record
  contents are stored encrypted (`server/crypto.ts`); secrets only as hashes.
- Schema changes are appended to `server/migrations.ts`; released migrations are never edited.
- Texts live in `src/i18n/en.ts` (source) and `de.ts`. No hard-coded user-facing strings.
- UI: own design tokens in `src/styles/app.css` (light and dark), no component or icon library,
  no third-party scripts, fonts or images; WCAG 2.1 AA.
- A shop page is read once, never crawled; no disguised client, no getting past a bot wall.

## Tests and checks

```sh
npm run verify       # format check, types, unit tests, the whole story in a real browser
npm test             # unit and integration tests (server logic on in-memory SQLite)
npm run test:e2e     # builds, starts the production server, runs e2e/ with passkeys and axe
npm run screenshots  # renews docs/images/ from the demo, light and dark
npm run test:visual:update  # keeps new pictures for the looks test (after npm run build)
npm run build:demo   # the website's demo: only the demo, for /propario/demo/ (src/site.ts)
```

The website is `site/` plus that demo: `scripts/build-site.sh <folder>` puts them together, and
`.github/workflows/pages.yml` publishes them on every change to `main`. The demo build keeps its
routes after the `#`, takes every file from under its base (`asset()` in `src/site.ts`) and never
asks a server; `e2e/static-demo.spec.ts` checks exactly that.

The end-to-end story runs axe on every page in both themes. Look at UI changes at 390 px and at
desktop width, in light and dark, in English and German; after a visible change, run
`npm run screenshots` and commit the pictures that changed. For container changes:
`docker build .`.

`e2e/visual.spec.ts` compares a few screens of the demo, on a fixed date, light and dark, with the
pictures kept in `e2e/visual.spec.ts-snapshots/`: it catches what other tests do not see – things
on top of each other, a panel too big for a phone. After a change meant to be seen, look at the
new pictures, keep them with `npm run test:visual:update` and commit them.

Ideas for later are collected, without promises, in [docs/roadmap.md](docs/roadmap.md).

Checks against your own data, which never get committed:

```sh
# the shop-page import against your products, without any AI – one page per shop
node --disable-warning=ExperimentalWarning scripts/check-shop-pages.ts /path/to/propario-backup.json
# the importer against your own workbooks
PV_XLSX="/path/a.xlsx:/path/b.xlsx" PV_VERBOSE=1 npx vitest run tests/real-files.test.ts
```

## Pull requests

- Branch from `main`, keep a pull request to one change, and describe the problem it solves.
- `main` is protected: changes arrive only through pull requests, which are squash-merged once
  the checks pass (format, types, tests, end-to-end, secret scan, container) and conversations
  are resolved.
- A change users will notice gets a line under _Unreleased_ in [CHANGELOG.md](CHANGELOG.md).

By contributing you agree that your contribution is licensed under the AGPL-3.0-or-later.

## Releases

Every release has a number, an annotated tag, an entry in [CHANGELOG.md](CHANGELOG.md), a
container image and a GitHub release. Versions follow [Semantic Versioning](https://semver.org);
while Propario is 0.x, the middle number rises for new features or changed behaviour, the last
for fixes. 1.0 is a deliberate decision, not a count.

- **A release follows a feature, not the calendar.** Changes collect under _Unreleased_. When
  something people notice is complete and verified – `npm run verify`, tried in a browser, and
  any outside service (an AI provider, a shop) called for real at least once – it ships as a
  minor release; whatever is finished at the same time ships with it. Fixes for bugs and security
  ship at once as a patch, without "What's new" (no entry in `src/releases.ts`). Docs, tests and
  refactoring alone are no release; they travel with the next one.
- **Making one:** in a pull request, raise `version` in `package.json`, turn _Unreleased_ into
  the dated entry (`## 0.x.y — YYYY-MM-DD`), and add at most four short lines per language to
  `src/releases.ts` – people see them once after the update. Merge it, then tag the merged commit
  on `main`: `git tag -a v0.x.y -m v0.x.y && git push origin v0.x.y` (only maintainers may push
  version tags).
- **What the tag does:** `.github/workflows/release.yml` checks that tag, `package.json` and
  CHANGELOG agree (`scripts/release-notes.sh v0.x.y` shows the notes beforehand), pushes the
  image `ghcr.io/schlatter/propario:0.x.y` (and `latest`) and publishes the GitHub release with
  the CHANGELOG entry. Releases cannot be changed afterwards – a mistake is fixed by the next
  version.
- **Which version is running:** _Settings_ shows it, e.g. `0.17.3+6d8dab7` – the release and the
  commit it was built from. Container builds have no Git history; the build argument
  `PROPARIO_COMMIT` passes the commit.
