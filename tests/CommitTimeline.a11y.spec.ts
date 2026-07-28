// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChartWorker } from '../app/composables/useChartWorker'
import CommitTimeline, { type CommitTimelineEntry } from '../app/components/charts/CommitTimeline.vue'

const sampleCommits: CommitTimelineEntry[] = [
  { date: '2026-07-01T09:00:00Z' },
  { date: '2026-07-01T14:30:00Z' },
  { date: '2026-07-02T10:15:00Z' },
  { date: '2026-07-03T08:00:00Z' },
  { date: '2026-07-03T08:45:00Z' },
  { date: '2026-07-03T20:00:00Z' },
  { date: '2026-07-05T11:00:00Z' },
]

// happy-dom has no global Worker, so this stub exercises the composable's real synchronous fallback.
beforeEach(() => {
  vi.stubGlobal('useChartWorker', useChartWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('CommitTimeline accessibility', () => {
  it('renders with no axe-core violations once the aggregation resolves', async () => {
    const wrapper = mount(CommitTimeline, {
      props: { commits: sampleCommits, granularity: 'day' },
      attachTo: document.body,
    })

    // Aggregation is async and the D3 render is flush: 'post' — both must settle before real SVG exists.
    await flushPromises()
    await nextTick()

    expect(wrapper.find('svg').exists()).toBe(true)

    const results = await axe.run(wrapper.element)

    // color-contrast never resolves under happy-dom (see axe-harness.spec.ts) — this doesn't cover contrast.
    expect(results.violations).toEqual([])

    wrapper.unmount()
  })
})
