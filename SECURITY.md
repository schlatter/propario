# Security

## Reporting a vulnerability

Please report privately: on GitHub use _Security → Report a vulnerability_ (private advisory),
otherwise contact the maintainer directly. Do not open a public issue. You get an answer within
a week.

## The baseline

Propario follows one rule: **keep only what comparing needs, protect all of it, and say what
happens.** Every change is measured against this list; `npm run verify` checks most of it.

### Data minimisation

- No e-mail addresses, no passwords, no phone numbers. A display name and a passkey are enough.
- Comparisons are private by default; the owner shares each one explicitly, to view or to edit.
- Pictures are re-encoded in the browser before upload (which drops EXIF/XMP metadata such as
  GPS position) and checked by their bytes on the server.
- Sessions end after 30 days unused and after 90 days in any case; invitations after 14 days or
  first use; sign-in challenges after 5 minutes. Expired rows are purged hourly; images no
  product refers to are removed after an hour.
- No analytics, no tracking, no third-party scripts, fonts or images.
- People can download everything they can see and delete their account themselves; deletion
  takes the comparisons they own along.

### Encryption

- In transit: HTTPS only; `ORIGIN` must be https except for localhost. HSTS is sent on https.
- At rest: every comparison record, picture and personal setting is encrypted with AES-256-GCM
  (`server/crypto.ts`), bound to its row by associated data. The key `DATA_KEY` lives outside the
  data directory; the server refuses to start in production without it. A copied database or
  backup reveals only ids, roles and timestamps.
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
- Session cookie `HttpOnly`, `SameSite=Strict`, `Secure` and `__Host-` prefixed on https.
- CSRF: every state-changing request must carry this instance's `Origin` (and JSON or an image).
- All input is validated before it reaches the database (`src/shared/records.ts`): only known
  fields with the expected types, ids are UUIDs, links http(s) only (also on render), pictures
  only from this server, size limits.
- Fetching a product page is guarded against SSRF: http(s) on ports 80/443, public addresses
  only, checked at connection time (DNS rebinding) and after every redirect, time and size
  limits, no cookies, SVG refused, signed-in users only.
- Facts read from a product page (GTIN, part number, price) are untrusted: only a GTIN with a
  valid check digit, a short plain part number and a euro amount pass, on the server and again
  in the browser (`src/shared/product-facts.ts`). They fill only empty fields.
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
