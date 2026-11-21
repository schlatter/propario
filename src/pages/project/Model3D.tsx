import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { updateProduct } from '../../db/repo'
import { MAX_PARTS, type Crop, type Product, type ShapePart } from '../../db/types'
import { arrange, cameraDistance, cropToUv, frontSlice, PERSON_M, sideSlice, type Part3D, type Placed } from '../../domain/scene'
import { fitsFront, shapeSize, type Size, type ViewPic } from '../../domain/size'
import { useI18n } from '../../i18n'
import { isShapePart } from '../../shared/records.ts'
import { Modal } from '../../ui/Dialog'
import { measureOnce } from './useMeasured'

export interface Model3DItem {
  id: string
  name: string
  /** From the size fields. */
  size: Size
  shape?: ShapePart[]
  pictures: Partial<Record<'front' | 'side' | 'back', ViewPic>>
}

const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

interface Scene3D {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  products: THREE.Group
  person: THREE.Group
  grid: THREE.GridHelper | null
  render: () => void
  keep: <T extends { dispose: () => void }>(x: T) => T
  colors: Record<'bg' | 'body' | 'edge' | 'line' | 'lineStrong' | 'brand', string>
  boxes: Map<string, Placed>
  homed: boolean
  home: () => void
  alive: boolean
}

/**
 * The products in 3D, to scale: each a box – or, with a form, its parts stacked from the floor,
 * backs against the wall – turned with a finger or the mouse, a person beside them. Pictures
 * marked as front, side or back cover those faces, each part with its slice. Opened for one
 * product (from its details), the form can be set here. Where the browser can (Chrome on Android
 * with ARCore), a product can be placed in the room through the camera – WebXR in the page
 * itself, nothing leaves the device. Loaded only when opened (three.js).
 */
export default function Model3D({ items, edit, onClose }: { items: Model3DItem[]; edit?: Product; onClose: () => void }) {
  const { m, fmt } = useI18n()
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const ctx = useRef<Scene3D | null>(null)
  const ar = useRef<{ session: XRSession | null; model: THREE.Group | null }>({ session: null, model: null })
  const [failed, setFailed] = useState(false)
  const [arAvailable, setArAvailable] = useState(false)
  const [arState, setArState] = useState<'off' | 'searching' | 'placed'>('off')
  const [arError, setArError] = useState(false)
  /** The form being set, as typed (cm); empty: one box from the size fields. */
  const [draft, setDraft] = useState<{ w: string; h: string; d: string }[]>(() =>
    (edit?.shape ?? []).map((p) => ({ w: String(p.w), h: String(p.h), d: String(p.d) })),
  )
  const parsed = draft.map((p) => ({ w: num(p.w), h: num(p.h), d: num(p.d) }))
  const valid = parsed.every(isShapePart)
  // While a form is being set, the view shows it as typed (as far as it is valid).
  const shown = items.map((i) => (edit && i.id === edit.id ? { ...i, shape: valid ? parsed : i.shape } : i))
  const placed = arrange(shown)
  const [arId, setArId] = useState(placed.boxes[0]?.id ?? '')
  const names = placed.boxes.map((b) => items.find((i) => i.id === b.id)!.name).join(', ')
  const shapeKey = JSON.stringify(placed.boxes)

  useEffect(() => {
    void navigator.xr
      ?.isSessionSupported('immersive-ar')
      .then(setArAvailable)
      .catch(() => setArAvailable(false))
  }, [])

  // ---------- the stage: renderer, camera, light, the person – built once ----------
  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-hidden', 'true')
    el.appendChild(renderer.domElement)
    const disposables: { dispose: () => void }[] = []
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)
    const colors = {
      bg: token('--surface', '#ffffff'),
      // Faces without a picture stay light in both themes, like the white behind product pictures.
      body: '#eef1f0',
      edge: token('--ink-2', '#374244'),
      line: token('--line', '#d6dddc'),
      lineStrong: token('--line-strong', '#b9c3c2'),
      brand: token('--brand', '#1f7a80'),
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(colors.bg)
    scene.add(...lights())
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI / 2 - 0.02 // never below the floor
    const person = makePerson(keep(new THREE.MeshStandardMaterial({ color: colors.lineStrong, roughness: 1 })), keep)
    const products = new THREE.Group()
    scene.add(person, products)
    const c: Scene3D = {
      renderer,
      scene,
      camera,
      controls,
      products,
      person,
      grid: null,
      keep,
      colors,
      boxes: new Map(),
      homed: false,
      home: () => {},
      alive: true,
      render: () => c.alive && !renderer.xr.isPresenting && renderer.render(scene, camera),
    }
    controls.addEventListener('change', c.render)
    const resize = () => {
      if (renderer.xr.isPresenting) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      c.render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    ctx.current = c
    return () => {
      c.alive = false
      void ar.current.session?.end().catch(() => {})
      ro.disconnect()
      controls.dispose()
      renderer.setAnimationLoop(null)
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      ctx.current = null
    }
  }, [])

  // ---------- the products: rebuilt when a form changes ----------
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    for (const child of [...c.products.children]) c.products.remove(child)
    c.boxes.clear()
    for (const p of placed.boxes) {
      c.boxes.set(p.id, p)
      const model = makeModel(
        c,
        p,
        shown.find((i) => i.id === p.id)!,
      )
      model.position.x = p.x
      c.products.add(model)
    }
    c.person.position.set(placed.personX, 0, 0)
    const last = placed.boxes.at(-1)
    const span = last ? last.x + last.w / 2 - placed.personX + PERSON_M.w : 1
    const tallest = Math.max(PERSON_M.h, ...placed.boxes.map((b) => b.h))
    if (c.grid) {
      c.scene.remove(c.grid)
      c.grid.geometry.dispose()
    }
    const size = Math.ceil(span + 3)
    c.grid = new THREE.GridHelper(size, size * 2, c.colors.lineStrong, c.colors.line)
    c.scene.add(c.grid)
    const centreX = (placed.personX - PERSON_M.w / 2 + (last ? last.x + last.w / 2 : 0)) / 2
    c.home = () => {
      const d = cameraDistance(span, tallest, c.camera.fov, c.camera.aspect)
      c.camera.position.set(centreX + d * 0.3, tallest * 0.75, d)
      c.controls.target.set(centreX, tallest / 2, 0)
      c.controls.minDistance = 0.5
      c.controls.maxDistance = d * 3
      c.controls.update()
    }
    // The camera stays where it is while a form is being set.
    if (!c.homed) {
      c.home()
      c.homed = true
    }
    c.render()
    // Rebuilt when sizes or forms change.
  }, [shapeKey, failed])

  // Taps on the buttons over the camera picture must not also place the product.
  useEffect(() => {
    const el = overlay.current
    const stop = (e: Event) => e.preventDefault()
    el?.addEventListener('beforexrselect', stop)
    return () => el?.removeEventListener('beforexrselect', stop)
  }, [])

  const turn = (deg: number) => {
    const c = ctx.current
    if (!c) return
    const offset = c.camera.position
      .clone()
      .sub(c.controls.target)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180)
    c.camera.position.copy(c.controls.target).add(offset)
    c.controls.update()
  }

  // ---------- in the room (WebXR) ----------
  const startAr = async (id: string) => {
    const c = ctx.current
    const p = c?.boxes.get(id)
    const item = shown.find((i) => i.id === id)
    if (!c || !p || !item || !navigator.xr) return
    setArError(false)
    let session: XRSession
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: overlay.current! },
      })
    } catch {
      setArError(true)
      return
    }
    const { renderer, camera, keep, colors } = c
    const arScene = new THREE.Scene()
    arScene.add(...lights())
    const reticle = new THREE.Mesh(
      keep(new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2)),
      keep(new THREE.MeshBasicMaterial({ color: colors.brand })),
    )
    reticle.matrixAutoUpdate = false
    reticle.visible = false
    const model = makeModel(c, { ...p, x: 0 }, item)
    // A soft shadow under it, so it stands on the floor instead of floating.
    const shadow = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(p.w + 0.08, p.d + 0.08).rotateX(-Math.PI / 2)),
      keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })),
    )
    shadow.position.y = 0.002
    model.add(shadow)
    model.visible = false
    arScene.add(reticle, model)
    ar.current = { session, model }

    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local')
    await renderer.xr.setSession(session)
    const viewer = await session.requestReferenceSpace('viewer')
    const hits = await session.requestHitTestSource?.({ space: viewer })
    if (!hits) {
      void session.end()
      setArError(true)
      return
    }
    const controller = renderer.xr.getController(0)
    controller.addEventListener('select', () => {
      if (!reticle.visible) return
      model.position.setFromMatrixPosition(reticle.matrix)
      // The front towards whoever placed it.
      const eye = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld)
      model.rotation.y = Math.atan2(eye.x - model.position.x, eye.z - model.position.z)
      model.visible = true
      setArState('placed')
    })
    arScene.add(controller)
    setArState('searching')
    renderer.setAnimationLoop((_, frame) => {
      if (frame) {
        const space = renderer.xr.getReferenceSpace()
        const found = frame.getHitTestResults(hits)[0]?.getPose(space!)
        reticle.visible = !!found
        if (found) reticle.matrix.fromArray(found.transform.matrix)
      }
      renderer.render(arScene, camera)
    })
    session.addEventListener('end', () => {
      hits.cancel()
      renderer.setAnimationLoop(null)
      renderer.xr.enabled = false
      ar.current = { session: null, model: null }
      if (!c.alive) return
      setArState('off')
      c.render()
    })
  }

  // ---------- the form ----------
  const fieldSize = items.find((i) => i.id === edit?.id)?.size
  const setPart = (i: number, key: 'w' | 'h' | 'd', v: string) => setDraft((d) => d.map((p, n) => (n === i ? { ...p, [key]: v } : p)))
  /** Splits the one box into a lower and an upper half, a start to adjust. */
  const split = () => {
    const s = fieldSize
    if (!s?.width || !s.height || !s.depth) return
    const lower = Math.round(s.height / 2)
    setDraft([
      { w: String(s.width), h: String(lower), d: String(s.depth) },
      { w: String(s.width), h: String(Math.round((s.height - lower) * 10) / 10), d: String(s.depth) },
    ])
  }
  const together = valid && parsed.length ? shapeSize(parsed) : null
  const cm = (n: number | undefined) => (n === undefined ? '–' : fmt.number(Math.round(n * 10) / 10))
  const differs =
    together && fieldSize && (['width', 'height', 'depth'] as const).some((k) => fieldSize[k] !== undefined && Math.abs(fieldSize[k]! - together[k]!) > 0.5)
  const saved = JSON.stringify(edit?.shape ?? []) === JSON.stringify(valid ? parsed : null)
  const save = () => edit && valid && void updateProduct(edit, { shape: parsed })

  return (
    <Modal open onClose={onClose} labelledBy="model3d-title" className="model3d-modal">
      <div className="dialog model3d">
        <div className="model3d-head">
          <h2 id="model3d-title">{edit ? m.model3d.titleOne(items[0]?.name ?? '') : m.model3d.title}</h2>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={onClose}>
            {m.common.close}
          </button>
        </div>
        {failed ? (
          <p className="muted">{m.model3d.noWebgl}</p>
        ) : (
          <>
            {placed.boxes.length === 0 && <p className="muted">{m.model3d.noSize}</p>}
            <div className="model3d-stage" ref={host} role="img" aria-label={m.model3d.label(names)} />
            <div className="model3d-tools">
              <p className="muted small">{m.model3d.hint}</p>
              <span className="spacer" />
              <button type="button" className="btn sm" onClick={() => turn(-30)}>
                {m.model3d.left}
              </button>
              <button type="button" className="btn sm" onClick={() => turn(30)}>
                {m.model3d.right}
              </button>
              <button type="button" className="btn sm" onClick={() => ctx.current?.home()}>
                {m.model3d.reset}
              </button>
            </div>
            {arAvailable && placed.boxes.length > 0 && (
              <div className="model3d-ar">
                {placed.boxes.length > 1 && (
                  <div className="seg" role="group" aria-label={m.model3d.arWhich}>
                    {placed.boxes.map((b) => (
                      <button key={b.id} type="button" aria-pressed={b.id === arId} onClick={() => setArId(b.id)}>
                        {items.find((i) => i.id === b.id)!.name}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className="btn primary" onClick={() => void startAr(arId)}>
                  {m.model3d.ar}
                </button>
                {arError && (
                  <p className="small" role="alert">
                    {m.model3d.arFailed}
                  </p>
                )}
              </div>
            )}
            {edit && (
              <section className="model3d-form" aria-labelledby="model3d-form-title">
                <h3 id="model3d-form-title">{m.model3d.formTitle}</h3>
                <p className="muted small">{m.model3d.formHint}</p>
                {draft.length === 0 ? (
                  <div className="row">
                    <span className="small">{m.model3d.oneBox(cm(fieldSize?.width), cm(fieldSize?.height), cm(fieldSize?.depth))}</span>
                    <span className="spacer" />
                    <button type="button" className="btn sm" onClick={split} disabled={!fieldSize?.width || !fieldSize.height || !fieldSize.depth}>
                      {m.model3d.split}
                    </button>
                  </div>
                ) : (
                  <ol className="model3d-parts">
                    {/* Top part first, as it stands. */}
                    {draft
                      .map((p, i) => ({ p, i }))
                      .reverse()
                      .map(({ p, i }) => (
                        <li key={i}>
                          <span className="model3d-part-name">{m.model3d.part(i + 1, draft.length)}</span>
                          {(['w', 'h', 'd'] as const).map((key) => (
                            <label key={key}>
                              <span>{m.model3d.sides[key]}</span>
                              <input
                                className="input"
                                type="number"
                                inputMode="decimal"
                                min="1"
                                max="1000"
                                step="0.5"
                                value={p[key]}
                                aria-invalid={!isShapePart({ w: 1, h: 1, d: 1, [key]: num(p[key]) })}
                                onChange={(e) => setPart(i, key, e.target.value)}
                              />
                            </label>
                          ))}
                          <button
                            type="button"
                            className="icon-btn sm"
                            aria-label={m.model3d.removePart(i + 1)}
                            title={m.model3d.removePart(i + 1)}
                            onClick={() => setDraft((d) => d.filter((_, n) => n !== i))}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                  </ol>
                )}
                {together && (
                  <p className="small">
                    {m.model3d.together(cm(together.width), cm(together.height), cm(together.depth))}
                    {differs && <span className="muted"> · {m.model3d.fields(cm(fieldSize?.width), cm(fieldSize?.height), cm(fieldSize?.depth))}</span>}
                  </p>
                )}
                <div className="row model3d-form-actions">
                  {draft.length > 0 && draft.length < MAX_PARTS && (
                    <button type="button" className="btn sm" onClick={() => setDraft((d) => [...d, { ...d[d.length - 1] }])}>
                      {m.model3d.addPart}
                    </button>
                  )}
                  {draft.length > 0 && (
                    <button type="button" className="btn sm" onClick={() => setDraft([])}>
                      {m.model3d.oneBoxAgain}
                    </button>
                  )}
                  <span className="spacer" />
                  <button type="button" className="btn primary sm" onClick={save} disabled={!valid || saved}>
                    {saved ? m.model3d.saved : m.model3d.saveForm}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {/* Shown over the camera picture while in the room. */}
        <div ref={overlay} className="model3d-overlay" hidden={arState === 'off'}>
          <p>{arState === 'placed' ? m.model3d.arPlaced : m.model3d.arHint}</p>
          <div className="row">
            {arState === 'placed' && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (ar.current.model) ar.current.model.rotation.y += Math.PI / 12
                }}
              >
                {m.model3d.arTurn}
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => void ar.current.session?.end()}>
              {m.model3d.arEnd}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

function lights() {
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(2, 4, 3)
  return [new THREE.HemisphereLight(0xffffff, 0x8a8f8f, 2.4), sun]
}

/**
 * A person 1.75 m tall in human proportions, as in the drawing to scale (src/ui/PersonFigure.tsx):
 * legs to about 46 % of the height, hands at mid-thigh, head an eighth. Feet at y = 0, facing +z.
 */
function makePerson(material: THREE.Material, keep: Scene3D['keep']): THREE.Group {
  const g = new THREE.Group()
  const capsule = (r: number, length: number, x: number, y: number, tilt = 0, sx = 1, sz = 1) => {
    const mesh = new THREE.Mesh(keep(new THREE.CapsuleGeometry(r, length, 6, 16)), material)
    mesh.position.set(x, y, 0)
    mesh.rotation.z = tilt
    mesh.scale.set(sx, 1, sz)
    g.add(mesh)
  }
  // Legs from the ankles to the hips, slightly apart.
  for (const side of [-1, 1]) capsule(0.068, 0.7, side * 0.08, 0.45)
  // Feet.
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.09, 0.06, 0.25)), material)
    foot.position.set(side * 0.08, 0.03, 0.05)
    g.add(foot)
  }
  // Torso from the hips to the shoulders, wider than deep.
  capsule(0.15, 0.4, 0, 1.13, 0, 1.15, 0.7)
  // Arms hanging from the shoulders to mid-thigh, a little away from the body.
  for (const side of [-1, 1]) capsule(0.042, 0.6, side * 0.23, 1.11, side * 0.06)
  // Neck and head; the head's top at 1.75 m.
  const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 16)), material)
  neck.position.y = 1.5
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.105, 24, 16)), material)
  head.scale.set(1, 1.18, 1.05)
  head.position.y = PERSON_M.h - 0.105 * 1.18
  g.add(neck, head)
  return g
}

/** One product: its parts with their slices of the marked pictures; origin at the centre of its footprint on the floor. */
function makeModel(c: Scene3D, p: Placed, item: Model3DItem): THREE.Group {
  const { keep, colors } = c
  const group = new THREE.Group()
  const plain = keep(new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.9 }))
  const edgeMaterial = keep(new THREE.LineBasicMaterial({ color: colors.edge }))
  const meshes = p.parts.map((part) => {
    const geometry = keep(new THREE.BoxGeometry(part.w, part.h, part.d))
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>(geometry, [plain, plain, plain, plain, plain, plain])
    const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(geometry)), edgeMaterial)
    for (const o of [mesh, edges]) o.position.set(0, part.y0 + part.h / 2, part.z)
    group.add(mesh, edges)
    return { mesh, part }
  })
  // Box faces: +x, −x, top, bottom, front (+z), back (−z). A side picture covers both sides.
  const slots: ['front' | 'side' | 'back', number[], (crop: Crop, part: Part3D) => Crop][] = [
    ['front', [4], (crop, part) => frontSlice(crop, part, p)],
    ['back', [5], (crop, part) => frontSlice(crop, part, p)],
    ['side', [0, 1], (crop, part) => sideSlice(crop, part, p)],
  ]
  for (const [view, faces, slice] of slots) {
    const pic = item.pictures[view]
    if (!pic) continue
    void measureOnce(pic.src).then((measured) => {
      const crop = pic.crop ?? measured?.crop ?? null
      // The main picture only when its shape is the front's – as in the drawing to scale.
      if (!c.alive || !crop || (!pic.marked && !(measured && fitsFront(crop, measured.ratio, p.w, p.h)))) return
      new THREE.ImageLoader().load(pic.src, (image) => {
        if (!c.alive) return
        for (const { mesh, part } of meshes) {
          const texture = keep(new THREE.Texture(image))
          texture.colorSpace = THREE.SRGBColorSpace
          const uv = cropToUv(slice(crop, part))
          texture.repeat.set(...uv.repeat)
          texture.offset.set(...uv.offset)
          texture.needsUpdate = true
          const material = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }))
          const list = [...mesh.material]
          for (const f of faces) list[f] = material
          mesh.material = list
        }
        c.render()
      })
    })
  }
  return group
}
