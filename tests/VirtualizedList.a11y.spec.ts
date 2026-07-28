// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVirtualList } from '../app/composables/useVirtualList'
import VirtualizedList from '../app/components/dashboard/VirtualizedList.vue'

interface SampleItem {
  id: number
  label: string
}

const sampleItems: SampleItem[] = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  label: `Item ${i}`,
}))

// Vitest skips Nuxt's auto-import transform, so the real composable is stubbed onto the global scope.
beforeEach(() => {
  vi.stubGlobal('useVirtualList', useVirtualList)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('VirtualizedList accessibility', () => {
  it('renders with no axe-core violations', async () => {
    const wrapper = mount(VirtualizedList<SampleItem>, {
      props: {
        items: sampleItems,
        itemHeight: 32,
        height: 240,
        getKey: (item: SampleItem) => item.id,
      },
      slots: {
        default: (slotProps: { item: SampleItem; index: number }) =>
          `<span>${slotProps.index}: ${slotProps.item.label}</span>`,
      },
      attachTo: document.body,
    })

    const results = await axe.run(wrapper.element)

    // No Tailwind CSS is loaded in this harness and color-contrast can't resolve under happy-dom
    // anyway (see axe-harness.spec.ts) — this doesn't cover contrast.
    expect(results.violations).toEqual([])

    wrapper.unmount()
  })
})
