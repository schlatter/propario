import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { arrange, cameraDistance, cropToUv, PERSON_M, type Placed } from '../../domain/scene'
import { fitsFront, type Size, type ViewPic } from '../../domain/size'
import { useI18n } from '../../i18n'
import { Modal } from '../../ui/Dialog'
import { measureOnce } from './useMeasured'

export interface Model3DItem {
  id: string
  name: string
  size: Size
  pictures: Partial<Record<'front' | 'side' | 'back', ViewPic>>
}

const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/**
 * The products as boxes of their real size, turned with a finger or the mouse, a person beside
 * them for scale. Pictures marked as front, side or back cover those faces. Where the browser
 * can (Chrome on Android with ARCore), one product can be placed in the room through the camera
 * – WebXR in the page itself, nothing leaves the device. Loaded only when opened (three.js).
 */
export default function Model3D({ items, onClose }: { items: Model3DItem[]; onClose: () => void }) {
  const { m } = useI18n()
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const actions = useRef<{
    turn: (deg: number) => void
    reset: () => void
    startAr: (id: string) => Promise<void>
    arTurn: () => void
    arEnd: () => void
  } | null>(null)
  const [failed, setFailed] = useState(false)
  const [arAvailable, setArAvailable] = useState(false)
  const [arState, setArState] = useState<'off' | 'searching' | 'placed'>('off')
  const [arError, setArError] = useState(false)
  const placed = arrange(items)
  const [arId, setArId] = useState(placed.boxes[0]?.id ?? '')
  const names = placed.boxes.map((b) => items.find((i) => i.id === b.id)!.name).join(', ')

  useEffect(() => {
    void navigator.xr
      ?.isSessionSupported('immersive-ar')
      .then(setArAvailable)
      .catch(() => setArAvailable(false))
  }, [])

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

    const colors = {
      bg: token('--surface', '#ffffff'),
      // Faces without a picture stay light in both themes, like the white behind product pictures.
      body: '#eef1f0',
      edge: token('--ink-2', '#374244'),
      line: token('--line', '#d6dddc'),
      lineStrong: token('--line-strong', '#b9c3c2'),
      brand: token('--brand', '#1f7a80'),
    }
    const disposables: { dispose: () => void }[] = []
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)
    let alive = true
    const render = () => alive && !renderer.xr.isPresenting && renderer.render(scene, camera)

    /** One product: a box standing on the floor, its origin at the centre of its footprint. */
    const makeBox = (p: Placed, item: Model3DItem) => {
      const group = new THREE.Group()
      const plain = keep(new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.9 }))
      const faces: THREE.Material[] = [plain, plain, plain, plain, plain, plain]
      const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(p.w, p.h, p.d)), faces)
      mesh.position.y = p.h / 2
      const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(mesh.geometry)), keep(new THREE.LineBasicMaterial({ color: colors.edge })))
      edges.position.y = p.h / 2
      group.add(mesh, edges)
      // Box faces: +x, −x, top, bottom, front (+z), back (−z). A side picture covers both sides.
      const slots: [keyof Model3DItem['pictures'], number[]][] = [
        ['front', [4]],
        ['back', [5]],
        ['side', [0, 1]],
      ]
      for (const [view, at] of slots) {
        const pic = item.pictures[view]
        if (!pic) continue
        void measureOnce(pic.src).then((measured) => {
          const crop = pic.crop ?? measured?.crop ?? null
          // The main picture only when its shape is the front's – as in the drawing to scale.
          if (!alive || (!pic.marked && !(measured && crop && fitsFront(crop, measured.ratio, p.w, p.h)))) return
          const texture = keep(new THREE.TextureLoader().load(pic.src, render))
          texture.colorSpace = THREE.SRGBColorSpace
          const uv = cropToUv(crop)
          texture.repeat.set(...uv.repeat)
          texture.offset.set(...uv.offset)
          const material = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }))
          for (const i of at) faces[i] = material
          mesh.material = [...faces]
          render()
        })
      }
      return group
    }

    const lights = () => {
      const sun = new THREE.DirectionalLight(0xffffff, 1.2)
      sun.position.set(2, 4, 3)
      return [new THREE.HemisphereLight(0xffffff, 0x8a8f8f, 2.4), sun]
    }

    // ---------- the 3D view ----------
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(colors.bg)
    scene.add(...lights())
    const boxes = new Map<string, Placed>()
    for (const p of placed.boxes) {
      boxes.set(p.id, p)
      const box = makeBox(
        p,
        items.find((i) => i.id === p.id)!,
      )
      box.position.x = p.x
      scene.add(box)
    }
    const span = placed.boxes.length ? placed.boxes.at(-1)!.x + placed.boxes.at(-1)!.w / 2 - placed.personX + PERSON_M.w : 1
    const tallest = Math.max(PERSON_M.h, ...placed.boxes.map((b) => b.h))
    const grid = new THREE.GridHelper(Math.ceil(span + 3), Math.ceil(span + 3) * 2, colors.lineStrong, colors.line)
    keep(grid.geometry)
    scene.add(grid)
    // The person, a plain figure in the same grey as in the drawing to scale.
    const skin = keep(new THREE.MeshStandardMaterial({ color: colors.lineStrong, roughness: 1 }))
    const body = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.17, 1.1, 6, 16)), skin)
    body.position.set(placed.personX, 0.72, 0)
    const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 24, 16)), skin)
    head.position.set(placed.personX, PERSON_M.h - 0.11, 0)
    scene.add(body, head)

    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100)
    const centreX = (placed.personX - PERSON_M.w / 2 + (placed.boxes.at(-1)?.x ?? 0) + (placed.boxes.at(-1)?.w ?? 0) / 2) / 2
    const target = new THREE.Vector3(centreX, tallest / 2, 0)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.maxPolarAngle = Math.PI / 2 - 0.02 // never below the floor
    controls.addEventListener('change', render)
    const home = () => {
      const d = cameraDistance(span, tallest, camera.fov, camera.aspect)
      camera.position.set(centreX + d * 0.3, tallest * 0.75, d)
      controls.target.copy(target)
      controls.minDistance = 0.5
      controls.maxDistance = d * 3
      controls.update()
    }
    const resize = () => {
      if (renderer.xr.isPresenting) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    home()
    render()

    // ---------- in the room (WebXR) ----------
    let session: XRSession | null = null
    let model: THREE.Group | null = null
    const startAr = async (id: string) => {
      const p = boxes.get(id)
      const item = items.find((i) => i.id === id)
      if (!p || !item || !navigator.xr) return
      setArError(false)
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
      const arScene = new THREE.Scene()
      arScene.add(...lights())
      const reticle = new THREE.Mesh(
        keep(new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2)),
        keep(new THREE.MeshBasicMaterial({ color: colors.brand })),
      )
      reticle.matrixAutoUpdate = false
      reticle.visible = false
      model = makeBox({ ...p, x: 0 }, item)
      // A soft shadow under it, so it stands on the floor instead of floating.
      const shadow = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(p.w + 0.08, p.d + 0.08).rotateX(-Math.PI / 2)),
        keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })),
      )
      shadow.position.y = 0.002
      model.add(shadow)
      model.visible = false
      arScene.add(reticle, model)

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
        if (!reticle.visible || !model) return
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
        session = null
        model = null
        if (!alive) return
        setArState('off')
        resize()
      })
    }

    actions.current = {
      turn: (deg) => {
        const offset = camera.position
          .clone()
          .sub(controls.target)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180)
        camera.position.copy(controls.target).add(offset)
        controls.update()
      },
      reset: home,
      startAr,
      arTurn: () => {
        if (model) model.rotation.y += Math.PI / 12
      },
      arEnd: () => void session?.end(),
    }

    return () => {
      alive = false
      void session?.end().catch(() => {})
      ro.disconnect()
      controls.dispose()
      renderer.setAnimationLoop(null)
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // Built once per opening; the products do not change while it is open.
  }, [])

  // Taps on the buttons over the camera picture must not also place the product.
  useEffect(() => {
    const el = overlay.current
    const stop = (e: Event) => e.preventDefault()
    el?.addEventListener('beforexrselect', stop)
    return () => el?.removeEventListener('beforexrselect', stop)
  }, [])

  return (
    <Modal open onClose={onClose} labelledBy="model3d-title" className="model3d-modal">
      <div className="dialog model3d">
        <div className="model3d-head">
          <h2 id="model3d-title">{m.model3d.title}</h2>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={onClose}>
            {m.common.close}
          </button>
        </div>
        {failed ? (
          <p className="muted">{m.model3d.noWebgl}</p>
        ) : (
          <>
            <div className="model3d-stage" ref={host} role="img" aria-label={m.model3d.label(names)} />
            <div className="model3d-tools">
              <p className="muted small">{m.model3d.hint}</p>
              <span className="spacer" />
              <button type="button" className="btn sm" onClick={() => actions.current?.turn(-30)}>
                {m.model3d.left}
              </button>
              <button type="button" className="btn sm" onClick={() => actions.current?.turn(30)}>
                {m.model3d.right}
              </button>
              <button type="button" className="btn sm" onClick={() => actions.current?.reset()}>
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
                <button type="button" className="btn primary" onClick={() => void actions.current?.startAr(arId)}>
                  {m.model3d.ar}
                </button>
                {arError && (
                  <p className="small" role="alert">
                    {m.model3d.arFailed}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {/* Shown over the camera picture while in the room. */}
        <div ref={overlay} className="model3d-overlay" hidden={arState === 'off'}>
          <p>{arState === 'placed' ? m.model3d.arPlaced : m.model3d.arHint}</p>
          <div className="row">
            {arState === 'placed' && (
              <button type="button" className="btn" onClick={() => actions.current?.arTurn()}>
                {m.model3d.arTurn}
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => actions.current?.arEnd()}>
              {m.model3d.arEnd}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
