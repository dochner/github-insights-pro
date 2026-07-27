import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useVirtualList } from '../app/composables/useVirtualList'

function scrollEvent(scrollTop: number): Event {
  return { target: { scrollTop } } as unknown as Event
}

describe('useVirtualList', () => {
  describe('windowing', () => {
    it('renders only items within the visible window + buffer, clamped at the list start', () => {
      const { startIndex, endIndex } = useVirtualList({
        itemCount: 1000,
        itemHeight: 20,
        containerHeight: 200,
      })

      // Top overscan clamps to 0 at the list start, so only the trailing overscan (4) + exclusive bound (1) extend endIndex past the 10 visible rows.
      expect(startIndex.value).toBe(0)
      expect(endIndex.value).toBe(15)
    })

    it('applies overscan on both ends once scrolled away from the boundaries', () => {
      const { startIndex, endIndex, onScroll } = useVirtualList({
        itemCount: 1000,
        itemHeight: 20,
        containerHeight: 200,
      })

      onScroll(scrollEvent(500))

      expect(startIndex.value).toBe(21)
      expect(endIndex.value).toBe(40)
    })
  })

  describe('scrolling', () => {
    it('updates scrollTop, startIndex, endIndex and offsetY reactively after onScroll', () => {
      const { scrollTop, startIndex, endIndex, offsetY, onScroll } = useVirtualList({
        itemCount: 1000,
        itemHeight: 10,
        containerHeight: 100,
      })

      expect(scrollTop.value).toBe(0)
      expect(startIndex.value).toBe(0)
      expect(endIndex.value).toBe(15)
      expect(offsetY.value).toBe(0)

      onScroll(scrollEvent(1000))

      expect(scrollTop.value).toBe(1000)
      expect(startIndex.value).toBe(96)
      expect(endIndex.value).toBe(115)
      expect(offsetY.value).toBe(960)
    })
  })

  describe('edge cases', () => {
    it('yields startIndex and endIndex both 0 when itemCount is 0', () => {
      const { startIndex, endIndex } = useVirtualList({
        itemCount: 0,
        itemHeight: 20,
        containerHeight: 200,
      })

      expect(startIndex.value).toBe(0)
      expect(endIndex.value).toBe(0)
    })

    it('still yields a non-degenerate overscan-only window when containerHeight is 0', () => {
      const { startIndex, endIndex } = useVirtualList({
        itemCount: 1000,
        itemHeight: 20,
        containerHeight: 0,
      })

      expect(startIndex.value).toBe(0)
      expect(endIndex.value).toBe(5)
      expect(endIndex.value).toBeGreaterThan(startIndex.value)
    })

    it('keeps endIndex >= startIndex across boundary and out-of-range scroll positions', () => {
      const { startIndex, endIndex, onScroll } = useVirtualList({
        itemCount: 50,
        itemHeight: 20,
        containerHeight: 200,
      })

      for (const scrollTop of [0, 5000, 100000]) {
        onScroll(scrollEvent(scrollTop))
        expect(endIndex.value).toBeGreaterThanOrEqual(startIndex.value)
      }
    })

    it('re-clamps a stale scrollTop into range once itemCount shrinks', () => {
      const itemCount = ref(1000)
      const { startIndex, endIndex, onScroll } = useVirtualList({
        itemCount,
        itemHeight: 20,
        containerHeight: 200,
      })

      onScroll(scrollEvent(15000))
      expect(startIndex.value).toBe(746)

      itemCount.value = 10

      expect(startIndex.value).toBe(9)
      expect(endIndex.value).toBe(10)
      expect(startIndex.value).toBeGreaterThanOrEqual(0)
      expect(endIndex.value).toBeLessThanOrEqual(10)
    })

    it('treats a NaN itemCount as 0 instead of propagating NaN', () => {
      const itemCount = ref(1000)
      const { startIndex, endIndex, totalHeight } = useVirtualList({
        itemCount,
        itemHeight: 20,
        containerHeight: 200,
      })

      itemCount.value = NaN

      expect(startIndex.value).toBe(0)
      expect(endIndex.value).toBe(0)
      expect(totalHeight.value).toBe(0)
    })

    it('treats a non-finite containerHeight as 0 instead of propagating NaN', () => {
      const containerHeight = ref(200)
      const { startIndex, endIndex, onScroll } = useVirtualList({
        itemCount: 1000,
        itemHeight: 20,
        containerHeight,
      })

      onScroll(scrollEvent(100))
      containerHeight.value = Infinity

      expect(startIndex.value).toBe(1)
      expect(endIndex.value).toBe(10)
      expect(Number.isFinite(endIndex.value)).toBe(true)
    })
  })

  describe('reactivity through MaybeRefOrGetter shapes', () => {
    it('reacts to itemCount passed as a plain ref', () => {
      const itemCount = ref(10)
      const { endIndex } = useVirtualList({
        itemCount,
        itemHeight: 20,
        containerHeight: 200,
      })

      expect(endIndex.value).toBe(10)

      itemCount.value = 3

      expect(endIndex.value).toBe(3)
    })

    it('reacts to itemCount passed as a getter function', () => {
      const source = ref(10)
      const { endIndex } = useVirtualList({
        itemCount: () => source.value,
        itemHeight: 20,
        containerHeight: 200,
      })

      expect(endIndex.value).toBe(10)

      source.value = 3

      expect(endIndex.value).toBe(3)
    })

    it('reacts to containerHeight passed as a computed getter', () => {
      const source = ref(100)
      const doubled = computed(() => source.value * 2)
      const { endIndex } = useVirtualList({
        itemCount: 1000,
        itemHeight: 20,
        containerHeight: doubled,
      })

      expect(endIndex.value).toBe(15)

      source.value = 500

      expect(endIndex.value).toBe(55)
    })
  })

  describe('overscan', () => {
    it('defaults to 4 rows on each side when omitted', () => {
      const { startIndex, endIndex, onScroll } = useVirtualList({
        itemCount: 1000,
        itemHeight: 10,
        containerHeight: 100,
      })

      onScroll(scrollEvent(500))

      expect(startIndex.value).toBe(46)
      expect(endIndex.value).toBe(65)
    })

    it('applies a custom overscan value to widen the window', () => {
      const { startIndex, endIndex, onScroll } = useVirtualList({
        itemCount: 1000,
        itemHeight: 10,
        containerHeight: 100,
        overscan: 10,
      })

      onScroll(scrollEvent(500))

      expect(startIndex.value).toBe(40)
      expect(endIndex.value).toBe(71)
    })
  })

  describe('totalHeight and offsetY', () => {
    it('computes totalHeight as itemCount * itemHeight', () => {
      const { totalHeight } = useVirtualList({
        itemCount: 250,
        itemHeight: 32,
        containerHeight: 400,
      })

      expect(totalHeight.value).toBe(8000)
    })

    it('computes offsetY as startIndex * itemHeight after scrolling', () => {
      const { offsetY, onScroll } = useVirtualList({
        itemCount: 1000,
        itemHeight: 15,
        containerHeight: 300,
      })

      onScroll(scrollEvent(750))

      expect(offsetY.value).toBe(690)
    })
  })
})
