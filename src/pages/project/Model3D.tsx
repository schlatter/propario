import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Crop, Drawing, Product, ShapePart } from '../../db/types'
import { arrange, cameraDistance, cropToUv, frontSlice, PERSON_M, sideSlice, type Part3D, type Placed } from '../../domain/scene'
import { fitsFront, type Size, type ViewPic } from '../../domain/size'
import { fitShape } from '../../domain/form'
import { ShapeEditor } from './ShapeEditor'
import { PictureViewDialog } from './PictureViewDialog'
import { useI18n } from '../../i18n'
import { Modal } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { InfoTip } from '../../ui/InfoTip'
import { atEdge, follow, Gestures, lerpAngle, wrap } from '../../domain/gestures'
import { drawingTexture, measureOnce, photoCanvas, photoColor, straightened } from './useMeasured'

export interface Model3DItem {
  id: string
  name: string
  /** From the size fields. */
  size: Size
  shape?: ShapePart[]
  pictures: Partial<Record<'front' | 'side' | 'back', ViewPic>>
  /** A dimension drawing: its lines go on the faces instead of photos. */
  drawing?: Drawing | null
  /** The main photo, for the product's colour. */
  photo?: string | null
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
  const bar = useRef<HTMLDivElement>(null)
  const dial = useRef<HTMLDivElement>(null)
  const ctx = useRef<Scene3D | null>(null)
  /** The running room view (WebXR), kept outside React: it changes every frame. */
  const room = useRef<Room | null>(null)
  const gestures = useRef(new Gestures(() => window.innerWidth))
  const [failed, setFailed] = useState(false)
  const [arAvailable, setArAvailable] = useState(false)
  const [arState, setArState] = useState<'off' | 'starting' | 'searching' | 'placed'>('off')
  const [arError, setArError] = useState(false)
  /** What the bar over the camera picture shows: the product in the room and whether it is see-through. */
  const [arShown, setArShown] = useState<{ id: string; ghost: boolean }>({ id: '', ghost: false })
  const fieldSize = items.find((i) => i.id === edit?.id)?.size ?? {}
  /** The form being set (cm), inside the product's size; empty: one box. Shown in 3D as it changes. */
  const [draft, setDraft] = useState<ShapePart[]>(() => fitShape(edit?.shape ?? [], fieldSize))
  const shown = items.map((i) => (edit && i.id === edit.id ? { ...i, shape: draft } : i))
  const placed = arrange(shown)
  const [arId, setArId] = useState(placed.boxes[0]?.id ?? '')
  const names = placed.boxes.map((b) => items.find((i) => i.id === b.id)!.name).join(', ')
  // Rebuilt when sizes, forms or pictures change (a front set while the view is open shows at once).
  const shapeKey = JSON.stringify([placed.boxes, items.map((i) => [i.pictures, i.drawing, i.photo])])
  /** The photo whose front corners are being set, from here. */
  const [cornersOf, setCornersOf] = useState<string | null>(null)

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
      void room.current?.session.end().catch(() => {})
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

  // In the room every touch is read here (tap, swipe, twist); the browser's own "select" would
  // place the product a second time.
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
  /** One product as it stands in the room, with a soft shadow so it stands instead of floating. */
  const roomModel = (c: Scene3D, id: string) => {
    const p = c.boxes.get(id)!
    const model = makeModel(
      c,
      { ...p, x: 0 },
      shown.find((i) => i.id === id)!,
    )
    const shadow = new THREE.Mesh(
      c.keep(new THREE.PlaneGeometry(p.w + 0.08, p.d + 0.08).rotateX(-Math.PI / 2)),
      c.keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })),
    )
    shadow.position.y = 0.002
    shadow.userData.shadow = true
    model.add(shadow)
    model.visible = false
    return model
  }

  const startAr = async (id: string) => {
    const c = ctx.current
    if (!c || !c.boxes.has(id) || !navigator.xr) return
    setArError(false)
    // The overlay must be shown before the session takes it over.
    setArState('starting')
    await new Promise((r) => requestAnimationFrame(r))
    let session: XRSession
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        // Anchors keep a product where it was set down while the phone learns the room.
        optionalFeatures: ['dom-overlay', 'anchors'],
        domOverlay: { root: overlay.current! },
      })
    } catch {
      setArState('off')
      setArError(true)
      return
    }
    const { renderer, camera, keep, colors } = c
    const scene = new THREE.Scene()
    scene.add(...lights())
    const reticle = new THREE.Mesh(
      keep(new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2)),
      keep(new THREE.MeshBasicMaterial({ color: colors.brand })),
    )
    reticle.visible = false
    const model = roomModel(c, id)
    scene.add(reticle, model)

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
    const r: Room = {
      session,
      scene,
      model,
      id,
      placed: false,
      turn: 0,
      base: 0,
      at: new THREE.Vector3(),
      anchor: null,
      wantDown: false,
      ghost: false,
      onPlaced: () => setArState('placed'),
      ended: false,
    }
    room.current = r
    setArShown({ id, ghost: false })
    setArState('searching')

    const ring = new THREE.Vector3()
    const ringTarget = new THREE.Vector3()
    const ringQuat = new THREE.Quaternion()
    const target = new THREE.Vector3()
    const eye = new THREE.Vector3()
    let last = 0
    renderer.setAnimationLoop((time, frame) => {
      const dt = last ? (time - last) / 1000 : 0
      last = time
      const space = renderer.xr.getReferenceSpace()
      if (frame && space) {
        const hit = frame.getHitTestResults(hits)[0]
        const pose = hit?.getPose(space)
        if (pose) {
          const p = pose.transform.position
          ringTarget.set(p.x, p.y, p.z)
          const o = pose.transform.orientation
          ringQuat.set(o.x, o.y, o.z, o.w)
          // The ring glides instead of jumping with every measurement.
          if (!reticle.visible) ring.copy(ringTarget)
          else ring.lerp(ringTarget, follow(dt, 0.06))
          reticle.position.copy(ring)
          reticle.quaternion.copy(ringQuat)
        }
        // The ring stays: it shows where a tap puts the product.
        reticle.visible = !!pose
        // A tap is only noted; a floor hit counts in its own frame, so it is set down here.
        if (r.wantDown) {
          r.wantDown = false
          if (hit && pose) setDownAt(r, hit, pose)
        }
        // Where the product should be: on the ring while it is a preview, then on its anchor.
        let goal: THREE.Vector3 | null = null
        if (r.placed) {
          const anchored = r.anchor && frame.trackedAnchors?.has(r.anchor) ? frame.getPose(r.anchor.anchorSpace, space) : null
          if (anchored) r.at.set(anchored.transform.position.x, anchored.transform.position.y, anchored.transform.position.z)
          goal = r.at
        } else if (pose) goal = ring
        if (goal) {
          eye.setFromMatrixPosition(renderer.xr.getCamera().matrixWorld)
          // Its front towards the phone while it is a preview; set down, it keeps its way.
          const facing = Math.atan2(eye.x - goal.x, eye.z - goal.z)
          const yaw = (r.placed ? r.base : facing) + r.turn
          target.copy(goal)
          if (!r.model.visible) {
            r.model.position.copy(target)
            r.model.rotation.y = yaw
            r.model.visible = true
          } else {
            const t = follow(dt, r.placed ? 0.05 : 0.08)
            r.model.position.lerp(target, t)
            r.model.rotation.y = lerpAngle(r.model.rotation.y, yaw, follow(dt, 0.05))
          }
          // The strip shows where the front is: in the middle it faces the phone, at the ends away.
          const d = dial.current
          if (d) {
            const rel = wrap(r.model.rotation.y - facing)
            d.style.setProperty('--front', `${50 - (rel / Math.PI) * 50}%`)
            d.style.setProperty('--spin', `${((r.model.rotation.y / (2 * Math.PI)) * 240) % 12}px`)
          }
        }
        seeThrough(r.model, r.ghost)
      }
      renderer.render(r.scene, camera)
    })
    session.addEventListener('end', () => {
      r.ended = true
      hits.cancel()
      r.anchor?.delete()
      renderer.setAnimationLoop(null)
      renderer.xr.enabled = false
      room.current = null
      if (!c.alive) return
      setArState('off')
      c.render()
    })
  }

  /** A tap sets the product down where the ring is (and moves it there once it stands) – in the next frame. */
  const setDown = () => {
    if (room.current) room.current.wantDown = true
  }

  /** Turns the product in the room; seen from above, positive is anticlockwise. */
  const turnInRoom = (by: number) => {
    if (room.current) room.current.turn += by
  }

  /** Another product of the comparison in the same place and the same way round – to compare in the room. */
  const nextInRoom = () => {
    const r = room.current
    const c = ctx.current
    if (!r || !c) return
    const ids = placed.boxes.map((b) => b.id)
    const id = ids[(ids.indexOf(r.id) + 1) % ids.length]
    const model = roomModel(c, id)
    model.position.copy(r.model.position)
    model.rotation.y = r.model.rotation.y
    model.visible = r.model.visible
    r.scene.remove(r.model)
    r.scene.add(model)
    r.model = model
    r.id = id
    setArShown({ id, ghost: r.ghost })
  }

  const onTouch = (kind: 'down' | 'move' | 'up', e: ReactPointerEvent<HTMLDivElement>) => {
    // The bar has its own buttons.
    if (e.target instanceof Element && e.target.closest('.model3d-ar-bar')) return
    const g = gestures.current
    // Touches from the edge are the phone's own (back, leave full screen): not read here.
    if (kind === 'down' && atEdge({ x: e.clientX, y: e.clientY }, window.innerWidth, window.innerHeight)) return
    const result =
      kind === 'down'
        ? g.down(e.pointerId, { x: e.clientX, y: e.clientY })
        : kind === 'move'
          ? g.move(e.pointerId, { x: e.clientX, y: e.clientY })
          : g.up(e.pointerId)
    if (result?.kind === 'turn') turnInRoom(result.by)
    if (result?.kind === 'tap') setDown()
  }
  const arBox = room.current ? ctx.current?.boxes.get(arShown.id) : undefined
  const arName = items.find((i) => i.id === arShown.id)?.name ?? ''
  const nextName = (() => {
    const ids = placed.boxes.map((b) => b.id)
    return items.find((i) => i.id === ids[(ids.indexOf(arShown.id) + 1) % ids.length])?.name ?? ''
  })()

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
            <p className="muted small model3d-hint">{m.model3d.hint}</p>
            {/* One row: turning on the left, the room on the right – it stands out. */}
            <div className="model3d-tools">
              <button type="button" className="icon-btn" aria-label={m.model3d.left} title={m.model3d.left} onClick={() => turn(-30)}>
                <Glyph name="turnLeft" />
              </button>
              <button type="button" className="icon-btn" aria-label={m.model3d.right} title={m.model3d.right} onClick={() => turn(30)}>
                <Glyph name="turnRight" />
              </button>
              <button type="button" className="icon-btn" aria-label={m.model3d.reset} title={m.model3d.reset} onClick={() => ctx.current?.home()}>
                <Glyph name="recentre" />
              </button>
              <span className="spacer" />
              {arAvailable && placed.boxes.length > 0 && (
                <button type="button" className="btn primary" onClick={() => void startAr(arId)}>
                  <Glyph name="room" /> {m.model3d.ar}
                </button>
              )}
            </div>
            {arAvailable && placed.boxes.length > 1 && (
              <div className="seg" role="group" aria-label={m.model3d.arWhich}>
                {placed.boxes.map((b) => (
                  <button key={b.id} type="button" aria-pressed={b.id === arId} onClick={() => setArId(b.id)}>
                    {items.find((i) => i.id === b.id)!.name}
                  </button>
                ))}
              </div>
            )}
            {arError && (
              <p className="small" role="alert">
                {m.model3d.arFailed}
              </p>
            )}
            {edit && (
              <ShapeEditor
                product={edit}
                size={fieldSize}
                draft={draft}
                setDraft={setDraft}
                photoFront={
                  !edit.views?.front?.quad && items[0]?.photo ? (
                    <span className="model3d-with-tip">
                      <button type="button" className="btn sm" onClick={() => setCornersOf(items[0].photo!)}>
                        <Glyph name="image" /> {m.model3d.photoFront}
                      </button>
                      <InfoTip text={m.model3d.photoFrontHint} />
                    </span>
                  ) : null
                }
              />
            )}
            {edit && cornersOf && <PictureViewDialog product={edit} src={cornersOf} size={fieldSize} corners onClose={() => setCornersOf(null)} />}
          </>
        )}
        {/* Shown over the camera picture while in the room: the whole screen reads touches, the bar has the buttons. */}
        <div
          ref={overlay}
          className="model3d-overlay"
          hidden={arState === 'off'}
          onPointerDown={(e) => onTouch('down', e)}
          onPointerMove={(e) => onTouch('move', e)}
          onPointerUp={(e) => onTouch('up', e)}
          onPointerCancel={(e) => onTouch('up', e)}
        >
          <div ref={bar} className="model3d-ar-bar">
            {arBox && (
              <p className="model3d-ar-name">
                <b>{arName}</b>{' '}
                <span className="muted">
                  {fmt.number(Math.round(arBox.w * 1000) / 10)} × {fmt.number(Math.round(arBox.h * 1000) / 10)} × {fmt.number(Math.round(arBox.d * 1000) / 10)}{' '}
                  cm
                </span>
              </p>
            )}
            <p className="small">{arState === 'placed' ? m.model3d.arPlaced : m.model3d.arHint}</p>
            <TurnDial dial={dial} onTurn={turnInRoom} />
            <div className="row model3d-ar-buttons">
              <button type="button" className="btn icon" aria-label={m.model3d.left} title={m.model3d.left} onClick={() => turnInRoom(Math.PI / 12)}>
                <Glyph name="turnLeft" />
              </button>
              <button type="button" className="btn icon" aria-label={m.model3d.right} title={m.model3d.right} onClick={() => turnInRoom(-Math.PI / 12)}>
                <Glyph name="turnRight" />
              </button>
              <button
                type="button"
                className="btn"
                aria-pressed={arShown.ghost}
                onClick={() => {
                  if (!room.current) return
                  room.current.ghost = !room.current.ghost
                  setArShown((s) => ({ ...s, ghost: !s.ghost }))
                }}
              >
                {m.model3d.arGhost}
              </button>
              {placed.boxes.length > 1 && (
                <button type="button" className="btn" onClick={nextInRoom} aria-label={m.model3d.arNextLabel(nextName)}>
                  {m.model3d.arNext}
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => void room.current?.session.end()}>
                {m.model3d.arEnd}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

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
  const lay = (faces: number[], make: (part: Part3D) => THREE.Material) => {
    for (const { mesh, part } of meshes) {
      const list = [...mesh.material]
      const material = make(part)
      for (const f of faces) list[f] = material
      mesh.material = list
    }
    c.render()
  }
  /** A texture from a canvas or picture, each part with its slice of it. */
  const fromImage = (faces: number[], image: HTMLCanvasElement | HTMLImageElement, slice: (part: Part3D) => Crop, tint?: boolean) =>
    lay(faces, (part) => {
      const texture = keep(image instanceof HTMLCanvasElement ? new THREE.CanvasTexture(image) : new THREE.Texture(image))
      texture.colorSpace = THREE.SRGBColorSpace
      const uv = cropToUv(slice(part))
      texture.repeat.set(...uv.repeat)
      texture.offset.set(...uv.offset)
      texture.needsUpdate = true
      const material = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, color: tint ? (colour ?? colors.body) : 0xffffff }))
      if (tint) tinted.push(material)
      return material
    })
  // The product's colour from its photo: on the faces without a picture, and over the drawing's lines.
  const tinted: THREE.MeshStandardMaterial[] = [plain]
  let colour: string | null = null
  if (item.photo)
    void photoColor(item.photo).then((col) => {
      if (!c.alive || !col) return
      colour = col
      for (const t of tinted) t.color.set(col)
      c.render()
    })
  const whole = { x: 0, y: 0, w: 1, h: 1 }
  const sides: { view: 'front' | 'side' | 'back'; faces: number[]; slice: (crop: Crop, part: Part3D) => Crop; aspect: number }[] = [
    { view: 'front', faces: [4], slice: (crop, part) => frontSlice(crop, part, p), aspect: p.w / p.h },
    { view: 'back', faces: [5], slice: (crop, part) => frontSlice(crop, part, p), aspect: p.w / p.h },
    { view: 'side', faces: [0, 1], slice: (crop, part) => sideSlice(crop, part, p), aspect: p.d / p.h },
  ]
  for (const { view, faces, slice, aspect } of sides) {
    const pic = item.pictures[view]
    const drawn = view !== 'back' ? item.drawing?.[view] : null
    // 1. A photo with its corners set: straightened onto the face, as if taken straight on.
    if (pic?.quad) {
      void straightened(pic.src, pic.quad, aspect).then((canvas) => c.alive && canvas && fromImage(faces, canvas, (part) => slice(whole, part)))
      continue
    }
    // 2. A photo marked for this side, or the main photo when it is taken straight on.
    // 3. Otherwise the dimension drawing's lines in the product's colour.
    const photo = pic && (pic.marked || !drawn) ? pic : null
    if (photo) {
      void measureOnce(photo.src).then((measured) => {
        const crop = photo.crop ?? measured?.crop ?? null
        const fits = photo.marked || (measured && crop && fitsFront(crop, measured.ratio, p.w, p.h))
        if (!c.alive || !crop) return
        if (!fits) {
          if (item.drawing && drawn)
            void drawingTexture(item.drawing.src, drawn).then((canvas) => c.alive && canvas && fromImage(faces, canvas, (part) => slice(whole, part), true))
          return
        }
        // Through a full-size copy: also a picture without a size of its own (SVG) comes out whole.
        void photoCanvas(photo.src).then((canvas) => c.alive && canvas && fromImage(faces, canvas, (part) => slice(crop, part)))
      })
    } else if (item.drawing && drawn) {
      void drawingTexture(item.drawing.src, drawn).then((canvas) => c.alive && canvas && fromImage(faces, canvas, (part) => slice(whole, part), true))
    }
  }
  return group
}

interface Room {
  session: XRSession
  scene: THREE.Scene
  model: THREE.Group
  id: string
  /** Set down (true) or still a preview on the ring. */
  placed: boolean
  /** The way round it was turned by hand, radians; added to where it faced when set down. */
  turn: number
  base: number
  /** Where it stands; followed by its anchor where the browser has anchors. */
  at: THREE.Vector3
  anchor: XRAnchor | null
  /** A tap waiting for the next frame to set the product down. */
  wantDown: boolean
  ghost: boolean
  /** Tells the bar that it stands. */
  onPlaced: () => void
  ended: boolean
}

/** Half see-through, to check what is behind it – a socket, a windowsill. The shadow stays as it is. */
function seeThrough(model: THREE.Object3D, on: boolean) {
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.shadow) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.transparent === on) continue
      m.transparent = on
      m.opacity = on ? 0.45 : 1
      m.depthWrite = !on
      m.needsUpdate = true
    }
  })
}

/** Sets the product down on a floor hit of the current frame, its front towards the phone, on an anchor where there are anchors. */
function setDownAt(r: Room, hit: XRHitTestResult, pose: XRPose) {
  const p = pose.transform.position
  r.at.set(p.x, p.y, p.z)
  // Set down as the preview faced (turned by hand included); moved later, it keeps its way round.
  if (!r.placed) r.base = r.model.rotation.y - r.turn
  r.placed = true
  r.anchor?.delete()
  r.anchor = null
  try {
    void hit
      .createAnchor?.()
      .then((a) => {
        if (!r.ended) r.anchor = a
        else a.delete()
      })
      .catch(() => {})
  } catch {
    // No anchors here: it stays where it was set down.
  }
  r.onPlaced()
}

/**
 * A strip to swipe on to turn the product – away from the edges of the screen, where a swipe
 * would be the phone's back gesture. Its ridges run along as it turns, and a petrol mark shows
 * where the front is: in the middle it faces the phone. A help for fingers only: the arrows beside it do the same
 * for the keyboard and screen readers.
 */
function TurnDial({ dial, onTurn }: { dial: RefObject<HTMLDivElement | null>; onTurn: (by: number) => void }) {
  const last = useRef<number | null>(null)
  return (
    <div
      ref={dial}
      className="model3d-dial"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        last.current = e.clientX
      }}
      onPointerMove={(e) => {
        if (last.current === null) return
        // The strip's width turns it half way round; right turns it right.
        onTurn(-((e.clientX - last.current) / Math.max(1, e.currentTarget.clientWidth)) * Math.PI)
        last.current = e.clientX
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    >
      <span />
      <i />
    </div>
  )
}
