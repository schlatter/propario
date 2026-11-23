# Contributing

Thank you for helping. Propario is small on purpose; this page explains what keeps it that way.

## Principles, in order

1. **KISS.** The simplest thing a person can read, review and operate. No new dependency,
   service, abstraction or setting without a concrete problem it solves.
2. **Security and privacy by design.** Private by default, shared on purpose. [SECURITY.md](SECURITY.md)
   is the baseline and every change keeps it true. When a change touches personal data, answer
   first: do we need to store it, can we store less, and is it encrypted, exported and deleted
   with the account?
3. **Think big, build small.** Do not block the future (more languages, other storage, more
   people), but build only what is needed now.

## Before you start

- For anything larger than a fix, open an issue first and describe the problem. That saves you
  work if it does not fit.
- Never put personal data into issues, commits or tests: no real names, workbooks, exports or
  screenshots of private comparisons. Test fixtures use invented people and products.

## Working on the code

```sh
nvm use            # the Node.js version in .nvmrc (fnm use works too)
npm ci
pre-commit install --hook-type pre-commit --hook-type pre-push
npm run dev        # http://localhost:5173; the terminal shows the one-time setup link
```

Development data lives in `./data/` (git-ignored).

- One Node.js version, set in `.nvmrc`: CI reads it, `engines` in `package.json` and the
  Dockerfile follow it, and a test checks that they agree. When Dependabot raises the Node image,
  raise `.nvmrc` and `engines` in the same pull request.

- `server/` is plain TypeScript that Node runs directly: erasable syntax only, relative imports
  with `.ts`. Every function that crosses user boundaries takes the acting person's id and
  checks the role itself; changes to access need a test in `server/access.test.ts`.
- Every input is checked in `src/shared/records.ts` before it reaches the database.
- Schema changes are appended to `server/migrations.ts`; released migrations are never edited.
- Texts live in `src/i18n/en.ts` (source) and `de.ts`. No hard-coded user-facing strings.
- UI: own design tokens in `src/styles/app.css` (light and dark), no component or icon library,
  WCAG 2.1 AA – the end-to-end test runs axe on every page in both themes.
- Words: the interface says _comparison_, the code says `project` (see [GLOSSARY.md](GLOSSARY.md)).

## Before you open a pull request

```sh
npm run verify    # format check, types, unit tests, end-to-end story with axe
```

Look at UI changes at 390 px and at desktop width, in light and dark, in English and German.
Add a line under _Unreleased_ in [CHANGELOG.md](CHANGELOG.md) if users will notice the change.

By contributing you agree that your contribution is licensed under the AGPL-3.0-or-later.
