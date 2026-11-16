/**
 * Consistent snapshot of the database while the server runs: `npm run backup [file]`
 * (in the container: `docker compose exec app node server/backup.ts`).
 * Comparisons and images stay encrypted in the copy; keep DATA_KEY apart from backups.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { loadConfig } from './env.ts'

const config = loadConfig({ ...process.env, NODE_ENV: 'development', ORIGIN: process.env.ORIGIN || 'http://localhost:8080' })
const source = join(process.env.DATA_DIR || config.dataDir, 'propario.db')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = resolve(process.argv[2] || join(dirname(source), 'backups', `propario-${stamp}.db`))
mkdirSync(dirname(target), { recursive: true })
const db = new DatabaseSync(source, { readOnly: true })
db.prepare('VACUUM INTO ?').run(target)
db.close()
console.log(`Backup written to ${target}`)
