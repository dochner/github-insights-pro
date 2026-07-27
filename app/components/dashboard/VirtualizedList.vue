<script setup lang="ts" generic="T">
import { computed } from 'vue'

const props = defineProps<{
  items: T[]
  itemHeight: number
  /** Viewport height in px; auto-measuring is a separate concern (useChartResize). */
  height: number
  /** Extracts a stable key per item — field name differs per consumer (sha, login, ...). */
  getKey: (item: T, index: number) => string | number
  overscan?: number
}>()

defineSlots<{
  default(props: { item: T; index: number }): unknown
}>()

const { startIndex, endIndex, totalHeight, offsetY, onScroll } = useVirtualList({
  itemCount: () => props.items.length,
  itemHeight: props.itemHeight,
  containerHeight: () => props.height,
  ...(props.overscan !== undefined ? { overscan: props.overscan } : {}),
})

// Re-pair each sliced item with its true source index for keys and aria-posinset.
const visibleItems = computed(() =>
  props.items
    .slice(startIndex.value, endIndex.value)
    .map((item, offset) => ({ item, index: startIndex.value + offset }))
)
</script>

<template>
  <div
    class="w-full overflow-y-auto"
    role="list"
    :style="{ height: `${height}px` }"
    @scroll="onScroll"
  >
    <div class="relative w-full" :style="{ height: `${totalHeight}px` }">
      <div class="absolute left-0 top-0 w-full" :style="{ transform: `translateY(${offsetY}px)` }">
        <div
          v-for="{ item, index } in visibleItems"
          :key="getKey(item, index)"
          role="listitem"
          :aria-posinset="index + 1"
          :aria-setsize="items.length"
          :style="{ height: `${itemHeight}px` }"
        >
          <slot :item="item" :index="index" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
