import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'

export interface UseVirtualListOptions {
  /** Total number of items in the (unvirtualized) source list. */
  itemCount: MaybeRefOrGetter<number>
  /** Fixed row height in pixels — dynamic/measured heights are out of scope. */
  itemHeight: number
  /** Height of the scrollable viewport in pixels. */
  containerHeight: MaybeRefOrGetter<number>
  /** Extra items rendered above/below the visible window. Defaults to 4. */
  overscan?: number
}

export interface UseVirtualListReturn {
  scrollTop: Ref<number>
  /** First index to render (inclusive). */
  startIndex: ComputedRef<number>
  /** Index to stop rendering before (exclusive) — use as the upper bound of `items.slice(startIndex, endIndex)`. */
  endIndex: ComputedRef<number>
  /** Full virtual height, for a spacer element so the scrollbar reflects the whole list. */
  totalHeight: ComputedRef<number>
  /** Pixel offset to translate the rendered slice by, so it lands at its true scroll position. */
  offsetY: ComputedRef<number>
  onScroll: (event: Event) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// 4 rows absorbs a typical fast wheel/trackpad flick between two scroll events without flashing blank rows, at a negligible extra render cost.
const DEFAULT_OVERSCAN = 4

export function useVirtualList(options: UseVirtualListOptions): UseVirtualListReturn {
  const { itemHeight, overscan = DEFAULT_OVERSCAN } = options
  const scrollTop = ref(0)

  // Math.max(0, NaN) is NaN, not 0, so a non-finite reactive read (e.g. a resize observer mid-measurement) is normalized explicitly here.
  const itemCount = computed(() => {
    const value = toValue(options.itemCount)
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  })
  const containerHeight = computed(() => {
    const value = toValue(options.containerHeight)
    return Number.isFinite(value) ? Math.max(0, value) : 0
  })

  const totalHeight = computed(() => itemCount.value * itemHeight)

  // Plain index arithmetic on every scroll event — no array work — is what keeps scrolling cheap at any list size.
  const startIndex = computed(() => {
    if (itemCount.value === 0) return 0
    const firstVisible = Math.floor(scrollTop.value / itemHeight)
    return clamp(firstVisible - overscan, 0, itemCount.value - 1)
  })

  const endIndex = computed(() => {
    if (itemCount.value === 0) return 0
    const lastVisible = Math.floor((scrollTop.value + containerHeight.value) / itemHeight)
    return clamp(lastVisible + overscan + 1, startIndex.value, itemCount.value)
  })

  const offsetY = computed(() => startIndex.value * itemHeight)

  function onScroll(event: Event): void {
    scrollTop.value = (event.target as HTMLElement).scrollTop
  }

  return {
    scrollTop,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    onScroll,
  }
}
