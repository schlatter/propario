# Security

## Reporting a vulnerability

Please report privately: on GitHub use _Security → Report a vulnerability_ (private advisory),
otherwise contact the maintainer directly. Do not open a public issue. You get an answer within
a week.

## The baseline

Propario follows one rule: **keep only what comparing needs, protect all of it, and say what
happens.** Every change is measured against this list; `npm run verify` checks most of it. No
switch turns a protection off, development included.

### Data minimisation

- No e-mail addresses, no passwords, no phone numbers. A display name and a passkey are enough.
- Comparisons are private by default; the owner shares each one explicitly, to view or to edit.
- Pictures are re-encoded in the browser before upload (which drops EXIF/XMP metadata such as
  GPS position) and checked by their bytes on the server.
- Sessions end after 30 days unused and after 90 days in any case; invitations after 14 days or
  first use; sign-in challenges after 5 minutes. Expired rows are purged hourly; images no
  product refers to are removed after an hour.
- No analytics, no tracking, no third-party scripts, fonts or images.
- The service worker (`src/service-worker.js`) caches only versioned app files (`/assets/*`) and
  an offline page – never pages, API answers or pictures; each release clears the one before.
- Troubleshooting (`src/debug.ts`) is off by default and per device. When switched on, the
  browser keeps its last 400 technical events in localStorage: requests by method, path
  without query, status and duration; errors by message; start steps – no contents. Reports to
  the server log then carry the last 15 of them. The support package is a file the person
  downloads and passes on themselves; it holds the same technical details only.
- The demo (`src/demo.ts`) runs entirely in the browser tab, in its own browser database: its
  changes go nowhere, other server calls are refused before they are sent, and its data is
  removed when it ends.
- When the app breaks or hangs, the browser reports it to the server log (`/api/client-error`):
  a random reference, the start-up step, the version, the page's path without query, the error
  message and stack – no contents of comparisons. One sanitised line per report, at most 20 per
  address in 10 minutes, same origin only.
- People can download everything they can see and delete their account themselves; deletion
  takes the comparisons they own along.
- One's own AI (`server/ai.ts`) is optional, per account and off until its person switches it on
  (`settings.useAi`, checked by the server); switching it off deletes the key. The API key is sealed with the
  account (`users.ai`), never sent back to the browser (only its last four characters), not part
  of the backups people download (server snapshots keep it sealed) and deleted with the
  account. A comparison goes to the provider only when its
  person presses _Ask_ or _Ask my AI for more_, as the same text "Copy for my AI" gives – without
  names of people – and only to the two fixed provider addresses (api.anthropic.com,
  api.openai.com); nothing typed by people decides where the server connects. Propario
  stores and logs neither requests nor answers; what the provider keeps is up to its terms. An answer's table changes nothing until it passes the
  preview of _Add or update products_. `PROPARIO_AI=off` switches it off for the instance.

### Encryption

- In transit: HTTPS only; `ORIGIN` must be https except for localhost. HSTS is sent on https.
- At rest: every comparison record, picture and personal setting is encrypted with AES-256-GCM
  (`server/crypto.ts`), bound to its row by associated data. The key `DATA_KEY` lives outside the
  data directory; the server refuses to start in production without it, and with a key that does
  not open the stored data. `npm run dev` encrypts too, with its own key in `.dev-data-key`; there
  is no unencrypted mode. A copied database or backup reveals only ids, roles and timestamps.
- Secrets are never stored in clear: session tokens, invitation tokens and recovery keys are
  SHA-256 hashes; passkeys are public keys.

### Access

- Passkeys only, with user verification (biometrics or device PIN). One-time recovery key.
- New accounts only through the one-time setup link (first account, printed to the server log)
  or an administrator's single-use invitation.
- Every function that crosses user boundaries checks the acting person's role itself; "not
  found" also means "not yours" (`server/access.test.ts`).
- Rate limits on sign-in, recovery, registration, picture fetching and uploads.

### The web application (OWASP ASVS level 1)

- Strict Content-Security-Policy (`script-src 'self'`, no inline scripts, no `eval`,
  `img-src 'self' data: blob:`, `frame-ancestors 'none'`), plus `X-Content-Type-Options`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `Permissions-Policy` – on every response, refusals included. API answers are `private, no-store`.
  The policy allows WebXR (`xr-spatial-tracking`) for this origin only, for viewing a product in the
  room: the browser composes the camera picture itself; the page never gets camera access
  (`camera=()`), and nothing of it leaves the device.
- Session cookie `HttpOnly`, `SameSite=Strict`, `Secure` and `__Host-` prefixed on https.
- CSRF: every state-changing request must carry this instance's `Origin` (and JSON or an image).
- All input is validated before it reaches the database (`src/shared/records.ts`): only known
  fields with the expected types, ids are UUIDs, links http(s) only (also on render), pictures
  only from this server, size limits.
- Fetching a product page is guarded against SSRF: http(s) on ports 80/443, public addresses
  only, checked at connection time (DNS rebinding) and after every redirect, time and size
  limits, no cookies, SVG refused, signed-in users only.
- Facts read from a product page (GTIN, part number, price, name, brand, category, colour,
  description, data sheet) are untrusted: only a GTIN with a valid check digit, a short plain
  part number, a euro amount and bounded single-line text pass, on the server and again in the
  browser (`src/shared/product-facts.ts`); the header carrying them is capped at about 6 KB.
  They fill only empty fields and are shown as plain text.
- Offers and outside ratings are checked entry by entry: exactly the known fields, numbers,
  http(s) links, ISO dates, at most 50 entries per product (`checkItems` in `src/shared/records.ts`).
- Links to other sites are built from a fixed list in the code (`src/domain/lookup.ts`) with
  encoded search terms, open with `noopener noreferrer`, and carry no tracking parameters.
- Errors show a reference, never a stack trace; the log has the details.

### The container (CIS Docker Benchmark)

Non-root user, read-only root file system, all capabilities dropped, `no-new-privileges`,
memory/CPU/process limits, a health check, rotated logs, published on `127.0.0.1` only (reach it
through the reverse proxy). Dependencies are pinned in `package-lock.json` and installed without
lifecycle scripts; the runtime image contains only the server's one dependency.

### Operations

- Security events (account created or deleted, sign-in and failures, recovery, passkeys,
  invitations, sharing) are logged as `[audit]` lines with a shortened account id and no
  personal data.
- `npm run sbom` writes a CycloneDX bill of materials; `npm run deps` monthly; Dependabot for
  npm, GitHub Actions and the base image; actions pinned by commit.
- Every commit is scanned by gitleaks and a repository policy (no databases, workbooks, exports,
  personal terms); CI repeats the scan and runs the full test suite.

## What this is not

A technical baseline, not a certification. Known limits:

- The encryption key sits on the same server as the data, as it must for the server to read it.
  It protects copies and backups, not a fully compromised server.
- The browser keeps a cached copy of what the person may see (IndexedDB) for speed; signing out
  deletes it. Anyone with access to an unlocked, signed-in device sees what that person sees.
- Concurrent edits merge field by field; two people changing the same field at the same moment:
  the later one wins.
