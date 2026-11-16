import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrations } from './migrations.ts'

export type DB = DatabaseSync

/** Opens (and if needed creates and migrates) the database. Use ':memory:' in tests. */
export function openDatabase(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

/** Runs `fn` in one write transaction; rolls back if it throws. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function schemaVersion(db: DB): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

function migrate(db: DB): void {
  const applied = schemaVersion(db)
  if (applied > migrations.length) {
    throw new Error(`Database schema (v${applied}) is newer than this version of Propario (v${migrations.length}).`)
  }
  for (let version = applied; version < migrations.length; version++) {
    db.exec('PRAGMA foreign_keys = OFF')
    try {
      tx(db, () => {
        db.exec(migrations[version])
        const broken = db.prepare('PRAGMA foreign_key_check').all()
        if (broken.length) throw new Error(`Migration ${version + 1} would leave ${broken.length} dangling references.`)
        db.exec(`PRAGMA user_version = ${version + 1}`)
      })
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  }
}
