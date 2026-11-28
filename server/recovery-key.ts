/**
 * Last resort for whoever runs the server: a fresh recovery key for an account whose passkeys
 * and recovery key are all lost.
 *
 *   npm run recovery-key -- "Display name"
 *   in the container: docker compose exec app node server/recovery-key.ts "Display name"
 *
 * The old recovery key stops working; the person signs in with the new one and adds a passkey.
 * Anyone who can run this already holds the database and its key, so it opens no door that was
 * not open before. The event is written to the audit log, without the key.
 */
import { join } from 'node:path'
import { openDatabase } from './db.ts'
import { loadConfig } from './env.ts'
import { audit, listUsers, renewRecoveryKey } from './users.ts'

const config = loadConfig({ ...process.env, NODE_ENV: 'development', ORIGIN: process.env.ORIGIN || 'http://localhost:8080' })
const db = openDatabase(join(process.env.DATA_DIR || config.dataDir, 'propario.db'))
const wanted = (process.argv[2] ?? '').trim().toLowerCase()
const users = listUsers(db)
/** A name as the terminal shows it: quoted, with every control character escaped (JSON leaves U+0080–U+009F). */
const shown = (name: string) => JSON.stringify(name).replace(/[\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
const matches = users.filter((u) => u.name.toLowerCase() === wanted)

if (matches.length !== 1) {
  console.error(
    `Usage: npm run recovery-key -- "Display name"\nAccounts: ${users.map((u) => shown(u.name)).join(', ') || 'none'}` +
      (matches.length > 1 ? '\nThat name is not unique on this instance.' : ''),
  )
  process.exit(1)
}

const user = matches[0]
const key = renewRecoveryKey(db, user.id)
audit('recovery-key-by-operator', user.id)
console.log(`New recovery key for ${shown(user.name)}:\n\n  ${key}\n\nThe old one no longer works. Hand it over in person, not by e-mail or chat.`)
