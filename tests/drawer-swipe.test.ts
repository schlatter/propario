// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ownsArrows } from '../src/pages/project/ProductDrawer'

describe('swiping through products in the details', () => {
  document.body.innerHTML = `
    <dialog class="drawer" open>
      <p id="plain">Price</p>
      <input id="field" />
      <div class="pimg-stage"><img id="strip" /></div>
      <dialog open class="model3d-modal"><canvas id="three"></canvas></dialog>
      <dialog open class="pview-modal"><button id="corner"></button></dialog>
    </dialog>`
  const el = (id: string) => document.getElementById(id)

  it('steps from the details themselves', () => {
    expect(ownsArrows(el('plain'))).toBe(false)
  })

  it('leaves swipes to fields, the picture strip and every dialog opened from the details', () => {
    expect(ownsArrows(el('field'))).toBe(true)
    expect(ownsArrows(el('strip'))).toBe(true)
    // Turning in 3D, dragging a corner: never the next product.
    expect(ownsArrows(el('three'))).toBe(true)
    expect(ownsArrows(el('corner'))).toBe(true)
  })
})
