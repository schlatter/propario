import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = 'http://localhost:4173'

/**
 * Starts the production server on a throwaway database and hands the tests the one-time setup
 * link it prints – exactly what someone hosting Propario does by hand.
 */
export default async function globalSetup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'propario-e2e-'))
  const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'server/main.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '4173',
      HOST: '127.0.0.1',
      ORIGIN,
      DATA_DIR: dataDir,
      DATA_KEY: randomBytes(32).toString('base64'),
      PROPARIO_IMAGE_FETCH: 'off',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  const setupUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server did not print a setup link')), 30_000)
    let output = ''
    server.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const match = output.match(/http:\/\/localhost:4173\/join\?setup=\S+/)
      if (match) {
        clearTimeout(timer)
        resolve(match[0])
      }
    })
    server.on('exit', (code) => reject(new Error(`The server exited early (${code})`)))
  })

  process.env.E2E_SETUP_URL = setupUrl
  return () => {
    server.kill()
    rmSync(dataDir, { recursive: true, force: true })
  }
}
