<script setup lang="ts">
import { computed } from 'vue'
import { useFiltersStore } from '../../stores/filters.store'

const filtersStore = useFiltersStore()

// filters.store already stores ISO YYYY-MM-DD strings, so these bind straight to <input type="date"> with no conversion.
const from = computed({
  get: () => filtersStore.dateRange.from ?? '',
  set: (value: string) => filtersStore.setDateRange(value === '' ? null : value, filtersStore.dateRange.to),
})

const to = computed({
  get: () => filtersStore.dateRange.to ?? '',
  set: (value: string) => filtersStore.setDateRange(filtersStore.dateRange.from, value === '' ? null : value),
})

function clear(): void {
  filtersStore.setDateRange(null, null)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <label for="filter-from" class="sr-only">From date</label>
    <input id="filter-from" v-model="from" type="date" class="date-input font-mono text-sm" />
    <span class="date-sep font-sans text-sm">to</span>
    <label for="filter-to" class="sr-only">To date</label>
    <input id="filter-to" v-model="to" type="date" class="date-input font-mono text-sm" />
    <button
      v-if="from || to"
      type="button"
      class="clear-btn font-sans text-xs"
      @click="clear"
    >
      Clear
    </button>
  </div>
</template>

<style scoped>
.date-input {
  background: transparent;
  color: var(--paper);
  border: 1px solid var(--hairline);
  padding: 0.35rem 0.5rem;
  color-scheme: dark;
}

.date-input:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}

.date-sep {
  color: rgb(from var(--paper) r g b / 60%);
}

.clear-btn {
  background: transparent;
  color: rgb(from var(--paper) r g b / 60%);
  border: 1px solid var(--hairline);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}

.clear-btn:hover,
.clear-btn:focus-visible {
  color: var(--paper);
  border-color: var(--accent);
}
</style>
