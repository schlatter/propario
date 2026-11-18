// @vitest-environment node
/**
 * Android offers "Install app" only with a manifest naming the app, a start address, standalone
 * display and PNG icons of 192 and 512 px. This keeps those in place.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const pub = (f: string) => path.join(root, 'public', f.replace(/^\//, ''))

/** Width and height from a PNG's header. */
function pngSize(file: string): [number, number] {
  const b = fs.readFileSync(file)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('installable web app', () => {
  it('has a manifest that Android accepts, linked from the page', () => {
    const m = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'))
    expect(m).toMatchObject({ name: 'Propario', start_url: '/', display: 'standalone' })
    for (const size of [192, 512]) {
      const icon = m.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === `${size}x${size}` && !i.purpose)
      expect(icon, `${size} px icon`).toBeTruthy()
      expect(pngSize(pub(icon.src))).toEqual([size, size])
    }
    const maskable = m.icons.find((i: { purpose?: string }) => i.purpose === 'maskable')
    expect(pngSize(pub(maskable.src))).toEqual([512, 512])
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    // "Share → Propario" on Android lands on /share with the shared title, text and link.
    expect(m.share_target).toEqual({ action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } })
  })
})
