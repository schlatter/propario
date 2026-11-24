# Propario – working agreements

Compare faster, decide better. Self-hosted web app, AGPL. Read `README.md` for what it
does, `CONTRIBUTING.md` for how the code is organised, tested and released, `SECURITY.md` for
the baseline, `docs/excel-import.md` before changing the importer, and `docs/brand.md` – vision,
mission and design guide – before changing the interface, its texts or the logo. User-facing
docs live in `docs/user-guide.md` and `docs/self-hosting.md`, the website in `site/`; keep them
true when a change makes them wrong, and renew the pictures with `npm run screenshots`. README, website
and the app's start page tell one story in the start page's words (`overview` in `src/i18n/en.ts`;
`tests/docs-consistency.test.ts` checks it): the README in more text, website and start page in pictures.

**Vision:** every bigger purchase becomes a good decision – on your own or together – without
spreadsheet chaos, without advertising, and without anyone else owning your data. Decide in doubt
by it.

## Principles, in order

1. **KISS.** The simplest thing a person can read, review and operate. No new dependency,
   service, abstraction or setting without a concrete problem.
2. **Security and privacy by design.** Private by default, shared on purpose. `SECURITY.md` is
   the baseline; every change keeps it true. When a change touches personal data: do we need
   to store it, can we store less, is it encrypted, exported and deleted with the account?
3. **Think big, build small.** Do not block the future (public GitHub project, more people,
   more languages), but build only what is needed now.
4. **Works without AI; AI only proposes.** Every feature has a path without AI – build or
   name it first. AI may only produce what a person could also enter by hand (a query, a table
   of products, a text); that goes through the same parser, preview and checks, and never
   decides, saves or fetches by itself. People bring their own AI (local preferred); it gets
   only what the feature needs, and only when they ask.

## Never

- Never commit personal data. `private/` and `data/` are git-ignored; real workbooks, backups,
  databases and the owner's names stay out (`scripts/check-repo-policy.sh`, `private/denylist.txt`).
  Test fixtures use invented people (Ada, Grace) and products.
- Never read or change another person's data without the role checks in `server/store.ts`
  (`projectRole`, `requireRole`). "Not found" is also the answer for "not yours".
- Never store a secret in clear: sessions, invitations and recovery keys are hashes.
- Never store record contents in clear: they go through `seal`/`open` (`server/crypto.ts`).
- Never add third-party scripts, fonts, analytics or images. The CSP in `server/app.ts` is part
  of the product.
- Read a product page once for its picture, never crawl; never disguise the client or get past
  a bot wall. Pictures are copied once and served from here.

## How the code is organised

- `server/*.ts`: plain TypeScript run by Node (erasable syntax, `.ts` imports). `app.ts` is the
  HTTP layer (headers, CSRF, sessions, routes), `store.ts` the access rules and sync,
  `users.ts`/`webauthn.ts` accounts and passkeys, `migrations.ts` the schema (append only).
- `src/shared/records.ts`: record shapes, validation and merge rules used by browser and server.
- Browser: Dexie is a cache of what the person may see; every write goes through
  `src/db/repo.ts` → `commit()` in `src/sync.ts`: shown at once, sent to the server, taken back
  if the server refuses it or cannot be reached – nothing stays that is not saved.
- Texts in `src/i18n/en.ts` (source) and `de.ts`; TypeScript enforces complete translations.
- UI: own design tokens in `src/styles/app.css` (light and dark), no component or icon library,
  WCAG 2.1 AA, touch targets 44 px, real labels and buttons. Petrol acts, amber points out;
  green, red and grey only for checks (`docs/brand.md`).
- Words: the interface says _comparison_, the code says `project` (`GLOSSARY.md`).

## Before saying something is done

```sh
npm run verify       # format check, types, unit + integration tests, e2e story with passkeys and axe
```

Changes to who may see or change what need a test in `server/access.test.ts`. UI changes are
looked at in a browser at 390 px and desktop width, light and dark, English and German. For
container changes: `docker build .`. A change users notice gets a line under _Unreleased_ in
`CHANGELOG.md`. Not every change is a release: releases bundle changes about monthly; never
raise the version for a single feature. A release raises `version` in `package.json`, dates its
CHANGELOG entry, adds at most four lines per language to `src/releases.ts`, is merged as a pull
request and then gets an annotated tag on `main` (`git tag -a v0.3.0 -m v0.3.0`); pushing the tag
publishes image and release (`.github/workflows/release.yml`). See "Releases" in
`CONTRIBUTING.md`. Commit only when asked.
