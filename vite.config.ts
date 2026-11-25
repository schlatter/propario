import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * The version people see: the release from package.json plus the commit it was built from,
 * e.g. 0.2.0+4d837a1. Container builds have no .git, so the deployment passes the commit in
 * PROPARIO_COMMIT.
 */
function buildId(): string {
  if (process.env.PROPARIO_COMMIT) return process.env.PROPARIO_COMMIT.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}
const build = buildId()
const version = build ? `${pkg.version}+${build}` : pkg.version

/**
 * Writes dist/version.json, which the server reports so open pages notice an update, and
 * dist/sw.js (src/service-worker.js) with the version in its cache name, so each release clears
 * the files of the one before.
 */
function versionFile(): Plugin {
  return {
    name: 'propario-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) + '\n' })
      const worker = readFileSync(new URL('./src/service-worker.js', import.meta.url), 'utf8').replaceAll('__VERSION__', version)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker })
    },
  }
}

/** Runs the real API (server/app.ts) inside the Vite dev server, on ./data/propario.db. */
function api(): Plugin {
  return {
    name: 'propario-api',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.VITEST) return
      // Encrypted as in production (server/env.ts).
      const { devDataKey } = await import('./server/env.ts')
      const dev = devDataKey(process.env.DATA_KEY, '.dev-data-key')
      process.env.DATA_KEY = dev.key
      const [{ createApp }, { openDatabase }, { loadConfig }, { keyProblem }] = await Promise.all([
        import('./server/app.ts'),
        import('./server/db.ts'),
        import('./server/env.ts'),
        import('./server/store.ts'),
      ])
      const config = loadConfig({ ...process.env, NODE_ENV: 'development', PORT: String(server.config.server.port ?? 5173) })
      const db = openDatabase(join(config.dataDir, 'propario.db'))
      // A key that does not open ./data stops the start here, with what to do.
      const problem = keyProblem(db, config.dataDir, false)
      if (problem) {
        console.error(`\n  ${problem}\n`)
        process.exit(1)
      }
      const app = createApp(db, config)
      server.httpServer?.once('listening', () => setTimeout(() => console.log(`\n  ${dev.note}`), 50))
      server.middlewares.use((req, res, next) => app.handle(req, res, next))
      server.httpServer?.once('listening', () => {
        const link = app.setupLink()
        if (link) setTimeout(() => console.log(`\n  No account yet. One-time setup link:\n  ${link}\n`), 100)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), api(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
