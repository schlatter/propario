// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkUrl, extractImageCandidates, fetchProductImage, isForbiddenAddress } from '../server/product-image.ts'

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

describe('extractImageCandidates', () => {
  it('prefers og:image, resolves relative URLs and decodes entities', () => {
    const html = `<head>
      <meta name="twitter:image" content="https://cdn.example/tw.jpg">
      <meta content="/img/main.jpg?w=800&amp;h=600" property="og:image" />
      <link rel="image_src" href="//cdn.example/src.png">
    </head>`
    expect(extractImageCandidates(html, 'https://shop.example/p/1')).toEqual([
      'https://shop.example/img/main.jpg?w=800&h=600',
      'https://cdn.example/tw.jpg',
      'https://cdn.example/src.png',
    ])
  })

  it('reads JSON-LD Product images (also inside @graph) and skips SVG and broken JSON', () => {
    const html = `
      <script type="application/ld+json">{ broken </script>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"BreadcrumbList"},
        {"@type":["Product"],"name":"Schrank","image":[{"@type":"ImageObject","url":"https://img.example/a.webp"},"https://img.example/b.jpg","https://img.example/logo.svg"]}
      ]}</script>`
    expect(extractImageCandidates(html, 'https://shop.example/')).toEqual(['https://img.example/a.webp', 'https://img.example/b.jpg'])
  })

  it('returns nothing for pages without image hints', () => {
    expect(extractImageCandidates('<html><body><img src="x.jpg"></body></html>', 'https://a.example/')).toEqual([])
  })
})

describe('address and URL checks', () => {
  it('refuses private, loopback and link-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.178.1', '172.20.0.5', '169.254.169.254', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1'])
      expect(isForbiddenAddress(ip), ip).toBe(true)
    for (const ip of ['93.184.216.34', '2a00:1450:4001:80b::200e', '1.1.1.1']) expect(isForbiddenAddress(ip), ip).toBe(false)
  })
  it('accepts only plain http(s) on standard ports', () => {
    expect(() => checkUrl('ftp://a.example/x')).toThrow('invalid-url')
    expect(() => checkUrl('https://user:pw@a.example/')).toThrow('invalid-url')
    expect(() => checkUrl('http://a.example:22/')).toThrow('invalid-url')
    expect(checkUrl('https://a.example/p?x=1').hostname).toBe('a.example')
  })
})

describe('fetchProductImage against a local test shop', () => {
  let server: http.Server
  let base = ''
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/product') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<html><head><meta property="og:image" content="/missing.jpg"><meta property="og:image" content="/img.png"></head></html>')
      } else if (req.url === '/moved') {
        res.writeHead(301, { location: '/product' })
        res.end()
      } else if (req.url === '/img.png') {
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end(PNG)
      } else if (req.url === '/forbidden') {
        res.writeHead(403)
        res.end()
      } else if (req.url === '/plain') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html></html>')
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('follows redirects, skips broken candidates and returns the image', async () => {
    const img = await fetchProductImage(`${base}/moved`, { allowPrivate: true })
    expect(img.contentType).toBe('image/png')
    expect(img.body.equals(PNG)).toBe(true)
    expect(img.source).toBe(`${base}/img.png`)
  })
  it('passes direct image URLs through', async () => {
    expect((await fetchProductImage(`${base}/img.png`, { allowPrivate: true })).source).toBe(`${base}/img.png`)
  })
  it('reports blocked, missing and image-less pages', async () => {
    await expect(fetchProductImage(`${base}/forbidden`, { allowPrivate: true })).rejects.toMatchObject({ code: 'blocked' })
    await expect(fetchProductImage(`${base}/nope`, { allowPrivate: true })).rejects.toMatchObject({ code: 'not-found' })
    await expect(fetchProductImage(`${base}/plain`, { allowPrivate: true })).rejects.toMatchObject({ code: 'no-image' })
  })
  it('refuses local addresses by default', async () => {
    await expect(fetchProductImage(`http://127.0.0.1/product`)).rejects.toMatchObject({ code: 'forbidden-address' })
    await expect(fetchProductImage(`http://[::1]/product`)).rejects.toMatchObject({ code: 'forbidden-address' })
    await expect(fetchProductImage(`http://localhost/product`)).rejects.toMatchObject({ code: 'forbidden-address' })
  })
})
