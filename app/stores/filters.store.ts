import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface DateRange {
  from: string | null
  to: string | null
}

const emptyDateRange: DateRange = { from: null, to: null }

export const useFiltersStore = defineStore('filters', () => {
  // ISO date strings (YYYY-MM-DD) so this binds directly to <input type="date"> without conversion.
  const dateRange = ref<DateRange>({ ...emptyDateRange })
  // repoKey-style value ("owner/repo", lowercased), same vocabulary as repos.store.
  const selectedRepo = ref<string | null>(null)
  const selectedContributor = ref<string | null>(null)

  const hasActiveFilters = computed(
    () => dateRange.value.from !== null
      || dateRange.value.to !== null
      || selectedRepo.value !== null
      || selectedContributor.value !== null,
  )

  function setDateRange(from: string | null, to: string | null): void {
    dateRange.value = { from, to }
  }

  function setSelectedRepo(key: string | null): void {
    // Normalize to repos.store's repoKey format so lookups by this value never miss on casing.
    selectedRepo.value = key === null ? null : key.toLowerCase()
  }

  function setSelectedContributor(login: string | null): void {
    selectedContributor.value = login
  }

  function resetFilters(): void {
    dateRange.value = { ...emptyDateRange }
    selectedRepo.value = null
    selectedContributor.value = null
  }

  return {
    dateRange,
    selectedRepo,
    selectedContributor,
    hasActiveFilters,
    setDateRange,
    setSelectedRepo,
    setSelectedContributor,
    resetFilters,
  }
})
