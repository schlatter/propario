# Self-hosting

Propario is one container: a small Node server with an SQLite database in a volume. Docker is
the one supported way to run it. This page covers everything from the first start to backups,
updates and getting someone back in.

- [What you need](#what-you-need)
- [Start](#start)
- [Your address and HTTPS](#your-address-and-https)
- [The first account and invitations](#the-first-account-and-invitations)
- [Configuration](#configuration)
- [Backups](#backups)
- [Updates](#updates)
- [When someone is locked out](#when-someone-is-locked-out)
- [Troubleshooting](#troubleshooting)

## What you need

- A machine with Docker and Docker Compose – a small VPS or a home server is plenty (the
  container is limited to 512 MB of memory and one CPU by default).
- For use beyond your own computer: a hostname with a valid HTTPS certificate and a reverse
  proxy (Traefik, Caddy, nginx …). Passkeys need HTTPS; only `localhost` may use plain http.

## Start

```sh
git clone https://github.com/schlatter/propario.git && cd propario
echo "DATA_KEY=$(openssl rand -base64 32)" >> .env   # once
docker compose up -d
docker compose logs app                              # shows the one-time setup link
```

**`DATA_KEY` encrypts every comparison, picture and personal setting at rest (AES-256-GCM).**
Without it the server does not start; if it is lost, the data cannot be read any more. Keep a
copy somewhere safe and apart from your backups.

`docker compose up -d` builds the image from the source. To run a released image instead,
replace `build: .` and `image: propario` in `compose.yaml` with one fixed version from the
[releases](https://github.com/schlatter/propario/releases), for example
`image: ghcr.io/schlatter/propario:0.18.0`.

The container runs read-only, without capabilities and as an unprivileged user; `compose.yaml`
sets this up and is a good starting point for your own setup.

## Your address and HTTPS

The container listens on `127.0.0.1:8080` only. Put it behind your reverse proxy and set the
public address once, in `.env`:

```sh
ORIGIN=https://propario.example.org
ADDRESS_HEADER=X-Forwarded-For   # so rate limits apply per visitor, not to the proxy
XFF_DEPTH=1
```

> **Choose the address once.** Passkeys are bound to the domain they were created on. If the
> address changes, existing passkeys stop working and everyone needs their recovery key.

**A private instance.** Propario needs no public exposure: route the hostname only inside your
VPN, keep a valid certificate (for example through a DNS challenge), and invite people. This is
how it is meant for a household or a group of friends.

## The first account and invitations

The setup link from `docker compose logs app` works once and creates the first account. That
account looks after the instance: under _Settings → People on this instance_ it creates
invitation links (each works once and expires after 14 days), sees open invitations and can
remove accounts. Everyone else signs up through such a link with their own passkey.

## Configuration

All settings are environment variables, usually set in `.env` next to `compose.yaml`.

| Variable               | Default                             | Meaning                                                                        |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `ORIGIN`               | — (`compose.yaml`: localhost:8080)  | Public address, e.g. `https://propario.example.org`. Passkeys are bound to it. |
| `DATA_KEY`             | — (required)                        | 32 random bytes in base64 (`openssl rand -base64 32`). Encrypts all content.   |
| `DATA_DIR`             | `/data` (container), `./data` (dev) | Where the SQLite database lives.                                               |
| `PORT`, `HOST`         | `8080`, `0.0.0.0`                   | Listen address inside the container.                                           |
| `ADDRESS_HEADER`       | —                                   | Header with the visitor's address behind a trusted proxy (`X-Forwarded-For`).  |
| `XFF_DEPTH`            | `1`                                 | Which entry of that header to trust, counted from the right.                   |
| `PROPARIO_IMAGE_FETCH` | `on`                                | `off` stops the server from reading product pages for pictures and facts.      |
| `PROPARIO_AI`          | `on`                                | `off`: nobody can connect their own AI (Claude, ChatGPT) on this instance.     |

## Backups

- **The whole instance:** `docker compose exec app node server/backup.ts` writes a consistent
  snapshot to `/data/backups/`. Copy it off the machine regularly. Without `DATA_KEY` a snapshot
  cannot be read – keep the key, but somewhere else.
- **Per person:** everyone can save what they see under _Backup → Download backup_ – one JSON
  file with all comparisons and pictures that restores on any Propario instance.

## Updates

1. Take a snapshot (see above).
2. Read the [changelog](../CHANGELOG.md) for the versions in between.
3. With a released image: raise the version in `compose.yaml`, then `docker compose up -d`.
   Building from source: `git pull && docker compose up -d --build`.

The database migrates itself on start. Open pages notice the newer server and offer to reload;
_Settings_ shows the running version, for example `0.17.3+6d8dab7` – the release and the commit
it was built from.

**Coming from version 0.1**, which kept everything in the browser: after signing in, _Backup_
offers to move those comparisons into the account.

## When someone is locked out

Everyone gets a recovery key when they join. If someone has lost all their passkeys _and_ their
recovery key:

```sh
docker compose exec app node server/recovery-key.ts "Display name"
```

This issues a new recovery key (the old one stops working). Hand it over in person.

## Troubleshooting

- **The server does not start:** `docker compose logs app`. A missing or wrong `DATA_KEY` and a
  wrong `ORIGIN` are the usual causes.
- **A browser does not start Propario** (blank, loading forever): after 10 seconds the page names
  the step it stopped at and shows a reference; `docker compose logs app | grep <reference>`
  shows the error. _Reset this browser_ (also at `/reset.html`) removes only Propario's copy in
  that browser – the sign-in and the data stay.
- **Something odd on one device:** _Settings → Troubleshooting_ switches on a detailed log for that
  device and downloads a support package – technical details only (version, device, app files,
  storage, requests, errors), no contents. With the log on, reports in the server log carry its
  last lines too.
- **Passkeys do not work:** the page must be served over HTTPS at exactly the address in
  `ORIGIN`.

Security baseline and how to report a vulnerability: [SECURITY.md](../SECURITY.md).
