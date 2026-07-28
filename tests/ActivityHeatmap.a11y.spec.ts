// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import ActivityHeatmap, { type ActivityHeatmapEntry } from '../app/components/charts/ActivityHeatmap.vue'

// Mix of zero and non-zero days exercises both render paths without the full 52-week default.
const sampleData: ActivityHeatmapEntry[] = [
  { date: '2026-06-29', count: 0 },
  { date: '2026-06-30', count: 3 },
  { date: '2026-07-01', count: 0 },
  { date: '2026-07-02', count: 7 },
  { date: '2026-07-03', count: 1 },
  { date: '2026-07-06', count: 12 },
  { date: '2026-07-07', count: 0 },
  { date: '2026-07-08', count: 4 },
]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ActivityHeatmap accessibility', () => {
  it('renders with no axe-core violations', async () => {
    const wrapper = mount(ActivityHeatmap, {
      props: { data: sampleData, weeks: 3 },
      attachTo: document.body,
    })

    const results = await axe.run(wrapper.element)

    // color-contrast never resolves under happy-dom (see axe-harness.spec.ts) — this doesn't cover contrast.
    expect(results.violations).toEqual([])

    wrapper.unmount()
  })

  // Proves the arrow-key shortcut actually moves focus, not just that it's attached.
  it('moves focus to the adjacent cell on ArrowRight/ArrowDown', () => {
    const wrapper = mount(ActivityHeatmap, {
      props: { data: sampleData, weeks: 3 },
      attachTo: document.body,
    })

    const cells = Array.from(wrapper.element.querySelectorAll('rect.heatmap-cell')) as SVGRectElement[]
    expect(cells.length).toBeGreaterThan(1)
    const first = cells[0]!
    first.focus()
    expect(document.activeElement).toBe(first)

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(document.activeElement).not.toBe(first)
    expect(document.activeElement?.tagName.toLowerCase()).toBe('rect')

    const afterRight = document.activeElement as SVGRectElement
    afterRight.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).not.toBe(afterRight)
    expect(document.activeElement?.tagName.toLowerCase()).toBe('rect')

    wrapper.unmount()
  })
})
