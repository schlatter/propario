/**
 * Schema migrations, applied in order. Append new ones; never edit a released migration.
 *
 * Record contents (`records.data`, `images.data`, `users.settings`, `users.ai`) are encrypted at rest when
 * DATA_KEY is set (see crypto.ts). Only what the server needs to route and authorise stays in
 * clear: ids, the owning project, a change counter, roles.
 */
export const migrations: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    recovery_hash TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX passkeys_user ON passkeys(user_id);
  CREATE TABLE sessions (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    seen_at INTEGER NOT NULL
  );
  CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    challenge TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX projects_owner ON projects(owner_id);
  CREATE TABLE members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    PRIMARY KEY (project_id, user_id)
  );
  CREATE INDEX members_user ON members(user_id);
  CREATE TABLE records (
    kind TEXT NOT NULL CHECK (kind IN ('projects', 'products', 'properties', 'requirements')),
    id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (kind, id)
  );
  CREATE INDEX records_project ON records(project_id, seq);
  CREATE TABLE tombstones (
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    deleted_at INTEGER NOT NULL
  );
  CREATE INDEX tombstones_seq ON tombstones(seq);
  CREATE TABLE images (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX images_project ON images(project_id);
  -- seq: last change number handed out; pruned: changes up to here may have lost their tombstones.
  CREATE TABLE counter (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL, pruned INTEGER NOT NULL);
  INSERT INTO counter VALUES (1, 0, 0);
  `,
  // One's own AI (server/ai.ts): provider, model and API key, sealed; gone with the account.
  `ALTER TABLE users ADD COLUMN ai TEXT NOT NULL DEFAULT '';`,
]
