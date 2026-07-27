import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

export interface UseChartResizeReturn {
  /** Observed element's content-box width in px. 0 before the first measurement. */
  width: Ref<number>
  /** Observed element's content-box height in px. 0 before the first measurement. */
  height: Ref<number>
}

// Exported separately so it's testable without a real ResizeObserver; contentRect is the pre-2020 fallback for contentBoxSize.
export function readEntrySize(entry: ResizeObserverEntry): { width: number; height: number } {
  const box = entry.contentBoxSize?.[0]
  if (box) {
    return { width: box.inlineSize, height: box.blockSize }
  }
  return { width: entry.contentRect.width, height: entry.contentRect.height }
}

export function useChartResize(target: Ref<HTMLElement | null>): UseChartResizeReturn {
  // 0/0 doubles as "not measured yet" (same convention useVirtualList uses for a 0 containerHeight) — treat as nothing-to-render, not a real empty box.
  const width = ref(0)
  const height = ref(0)

  let observer: ResizeObserver | null = null

  function attach(element: HTMLElement | null): void {
    observer?.disconnect()
    observer = null
    if (!element) return

    const rect = element.getBoundingClientRect()
    width.value = rect.width
    height.value = rect.height

    observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      // ResizeObserver already batches to one entry per element per frame, so coalescing via requestAnimationFrame would only add latency, not reduce work.
      const size = readEntrySize(entry)
      width.value = size.width
      height.value = size.height
    })
    observer.observe(element)
  }

  // ResizeObserver is browser-only; onMounted (which registers the watch that constructs it) never runs during SSR.
  onMounted(() => {
    watch(target, attach, { immediate: true })
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return { width, height }
}
