import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { readEntrySize, useChartResize } from '../app/composables/useChartResize'

describe('useChartResize', () => {
  describe('readEntrySize', () => {
    it('reads dimensions from contentBoxSize when the browser reports it', () => {
      const entry = {
        contentBoxSize: [{ inlineSize: 320, blockSize: 180 }],
        contentRect: { width: 999, height: 999 },
      } as unknown as ResizeObserverEntry

      expect(readEntrySize(entry)).toEqual({ width: 320, height: 180 })
    })

    it('falls back to contentRect when contentBoxSize is unavailable', () => {
      const entry = {
        contentBoxSize: undefined,
        contentRect: { width: 640, height: 360 },
      } as unknown as ResizeObserverEntry

      expect(readEntrySize(entry)).toEqual({ width: 640, height: 360 })
    })
  })

  describe('usage with no active component instance', () => {
    // Not a faithful SSR simulation: real SSR has a valid instance during setup(), so onMounted()
    // registers silently (Vue's createHook skips it via isInSSRComponentSetup, no warning) and the
    // hook queue is simply never invoked. Calling with no instance at all — as below — instead hits
    // injectHook's target-null branch, which warns. Different guard, same external result (0x0, no
    // ResizeObserver touched). A truer SSR-path test would need @vue/server-renderer, which isn't a
    // resolvable dependency here (nested only under @vue/test-utils, not hoisted), or a jsdom mount,
    // which isn't configured in this project.
    it('never touches ResizeObserver when there is no instance to run a mount lifecycle, defaulting to 0x0', () => {
      // Vitest's default (node) environment has no ResizeObserver, same as real Nuxt SSR — this guards
      // that the premise below actually holds rather than passing vacuously.
      expect((globalThis as { ResizeObserver?: unknown }).ResizeObserver).toBeUndefined()

      const target = ref<HTMLElement | null>(null)
      const { width, height } = useChartResize(target)

      expect(width.value).toBe(0)
      expect(height.value).toBe(0)
    })
  })
})
