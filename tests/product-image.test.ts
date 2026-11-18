// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkUrl, encodeFacts, extractImageCandidates, extractProductFacts, fetchProductImage, isForbiddenAddress } from '../server/product-image.ts'

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

describe('extractProductFacts', () => {
  it('reads GTIN, MPN and a euro price from JSON-LD, also inside @graph and offers', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},
      {"@type":"Product","name":"Waschmaschine","gtin13":"4006381333931","mpn":"WAX32M40",
       "offers":{"@type":"Offer","price":"849.00","priceCurrency":"EUR"}}]}</script>`
    expect(extractProductFacts(html)).toEqual({ gtin: '4006381333931', mpn: 'WAX32M40', price: 849, name: 'Waschmaschine' })
  })

  it('falls back to microdata and drops prices in other currencies and malformed values', () => {
    const html = `<meta itemprop="gtin13" content="4006381333931"><meta itemprop="sku" content="ignored">
      <script type="application/ld+json">{"@type":"Product","mpn":"<b>x</b>","offers":[{"price":99,"priceCurrency":"USD"}]}</script>`
    expect(extractProductFacts(html)).toEqual({ gtin: '4006381333931' })
  })

  it('reads name, brand, category, colour and the data sheet from JSON-LD', () => {
    const html = `<script type="application/ld+json">[
      {"@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":2,"name":"Kleiderschränke"},{"@type":"ListItem","position":1,"name":"Möbel"},
        {"@type":"ListItem","position":3,"item":{"name":"Arvika 2-türig"}}]},
      {"@type":"Product","name":"Arvika 2-türig","brand":{"@type":"Brand","name":"Nordhaus"},"color":"Eiche",
       "description":"<p>Ein <b>schöner</b> Schrank.</p>",
       "width":{"@type":"QuantitativeValue","value":600,"unitCode":"MMT"},
       "additionalProperty":[{"@type":"PropertyValue","name":"Höhe","value":"180","unitText":"cm"},{"name":"Türen","value":2}]}
    ]</script>`
    expect(extractProductFacts(html)).toEqual({
      name: 'Arvika 2-türig',
      brand: 'Nordhaus',
      category: 'Kleiderschränke',
      color: 'Eiche',
      description: 'Ein schöner Schrank.',
      specs: [
        { name: 'Width', value: '600', unit: 'mm' },
        { name: 'Höhe', value: '180', unit: 'cm' },
        { name: 'Türen', value: '2' },
      ],
    })
  })

  it('falls back to Open Graph and reads data-sheet tables as less certain lines', () => {
    const html = `<meta property="og:title" content="Arvika &amp; Co"><meta property="product:brand" content="Nordhaus">
      <table><tr><th>Breite:</th><td>60&nbsp;cm</td></tr><tr><td>Tiefe</td><td><span>55</span> cm</td></tr>
      <tr><td>a</td><td>b</td><td>c</td></tr></table><dl><dt>Farbe</dt><dd>Weiß</dd></dl>`
    expect(extractProductFacts(html)).toEqual({
      name: 'Arvika & Co',
      brand: 'Nordhaus',
      specs: [
        { name: 'Breite', value: '60 cm', table: true },
        { name: 'Tiefe', value: '55 cm', table: true },
        { name: 'Farbe', value: 'Weiß', table: true },
      ],
    })
  })

  it('reads data-sheet cells holding lists: the first item, then "Label: value" items as lines of their own', () => {
    // Structure as seen on a furniture shop (2026-11), values invented.
    const li = (s: string) => `<li class="properties-list-value"><span><span class="properties-interpolate-value">${s}</span></span></li>`
    const html = `<table><tr class="properties-row"><th class="properties-label" scope="row"> Abmessungen </th>
      <td class="properties-value"><ul>${li('H/B/T ca. 190/60/40 cm')}${li('Fach links: H/B/T ca. 40/20/30 cm')}${li('ohne Doppelpunkt')}</ul></td></tr>
      <tr><th>Gewicht</th><td>Gesamtgewicht ca. 50 kg</td></tr>
      <tr><th>Lang</th><td>${'Wort '.repeat(60)}</td></tr></table>`
    const specs = extractProductFacts(html).specs!
    expect(specs.slice(0, 3)).toEqual([
      { name: 'Abmessungen', value: 'H/B/T ca. 190/60/40 cm', table: true },
      { name: 'Fach links', value: 'H/B/T ca. 40/20/30 cm', table: true },
      { name: 'Gewicht', value: 'Gesamtgewicht ca. 50 kg', table: true },
    ])
    // A long value is cut at a word, not dropped.
    expect(specs[3].value.length).toBeLessThanOrEqual(200)
    expect(specs[3].value.endsWith(' …')).toBe(true)
  })

  it('copes with real-world page quirks: encoding, shop name in the title, templates, dimensions as colour', async () => {
    const { decodeHtml, stripSiteName } = await import('../server/product-image.ts')
    expect(decodeHtml(Buffer.from('<p>Für Küche</p>', 'latin1'), 'text/html; charset=ISO-8859-1')).toBe('<p>Für Küche</p>')
    expect(decodeHtml(Buffer.from('<meta charset="iso-8859-1"><p>Größe</p>', 'latin1'), 'text/html')).toContain('Größe')
    expect(decodeHtml(Buffer.from('<p>Größe</p>'), 'text/html')).toBe('<p>Größe</p>')
    expect(stripSiteName('Buffet Arvika – Beispielshop', 'Beispielshop')).toBe('Buffet Arvika')
    expect(stripSiteName('Buffetschrank Arvika | Beispiel GmbH & Co. KG')).toBe('Buffetschrank Arvika')

    const html = `<meta itemprop="name" content="Startseite"><meta property="og:title" content="Regal Arvika | Shop">
      <meta itemprop="color" content="B 131 cm/ H 190 cm/ T 45 cm">
      <table><tr><th>Eigenschaft</th><td>Wert</td></tr><tr><th>\${ item.id }</th><td>\${ item.value }</td></tr>
      <tr><th>Material</th><td>Kiefer</td></tr></table>`
    expect(extractProductFacts(html)).toEqual({ name: 'Regal Arvika', specs: [{ name: 'Material', value: 'Kiefer', table: true }] })
  })

  it('reads microdata on visible elements inside the product only, and dimensions named in the text', () => {
    // Structure as seen on a furniture shop (2026-11), values invented.
    const html = `<ol itemscope itemtype="https://schema.org/BreadcrumbList"><li itemprop="itemListElement"><span itemprop="name">Startseite</span></li></ol>
      <div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Buffet Arvika weiß</h1>
      <div itemprop="brand"><span>Hersteller: Nordhaus</span></div><meta name="description" content="Kurz und ohne Maße"><span itemprop="price" content="499.00">499,00 €</span><meta itemprop="priceCurrency" content="EUR">
      <div itemprop="description"><div class="box"><h3>Details</h3></div><p>Es hat eine Gesamtbreite von 130 cm, eine Höhe von 196 cm und eine Tiefe von 39-43 cm.</p></div></div>`
    const f = extractProductFacts(html)
    expect(f).toMatchObject({ name: 'Buffet Arvika weiß', brand: 'Nordhaus', price: 499 })
    expect(f.specs).toEqual([
      { name: 'Breite', value: '130', unit: 'cm', table: true },
      { name: 'Höhe', value: '196', unit: 'cm', table: true },
    ])
  })

  it('cuts search-engine tails off titles', async () => {
    const { stripSiteName } = await import('../server/product-image.ts')
    expect(stripSiteName('Vitrine Arvika in Grau günstig online kaufen')).toBe('Vitrine Arvika in Grau')
    expect(stripSiteName('Sofa Bo jetzt online bestellen bei Beispiel')).toBe('Sofa Bo')
  })

  it('keeps the facts header small, dropping table lines first', () => {
    const specs = Array.from({ length: 60 }, (_, i) => ({ name: `Zeile ${i}`, value: 'ä'.repeat(150), table: true }))
    const encoded = encodeFacts({ name: 'Arvika', specs: [{ name: 'Breite', value: '60' }, ...specs] })
    expect(encoded.length).toBeLessThanOrEqual(6000)
    expect(JSON.parse(Buffer.from(encoded, 'base64url').toString())).toEqual({ name: 'Arvika', specs: [{ name: 'Breite', value: '60' }] })
  })

  it('finds nothing on pages without product data', () => {
    expect(extractProductFacts('<html><body>Hallo</body></html>')).toEqual({})
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
        res.end(
          '<html><head><meta property="og:image" content="/missing.jpg"><meta property="og:image" content="/img.png"><meta itemprop="gtin13" content="4006381333931"></head></html>',
        )
      } else if (req.url === '/moved') {
        res.writeHead(301, { location: '/product' })
        res.end()
      } else if (req.url === '/img.png') {
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end(PNG)
      } else if (req.url === '/forbidden') {
        res.writeHead(403)
        res.end()
      } else if (req.url === '/facts-only') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html><head><meta property="og:title" content="Arvika"></head></html>')
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
  it('returns the facts of the page it read for the picture', async () => {
    expect((await fetchProductImage(`${base}/moved`, { allowPrivate: true })).facts).toEqual({ gtin: '4006381333931' })
  })
  it('keeps the facts of a page that has no picture', async () => {
    await expect(fetchProductImage(`${base}/facts-only`, { allowPrivate: true })).rejects.toMatchObject({ code: 'no-image', facts: { name: 'Arvika' } })
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
