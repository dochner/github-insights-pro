import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFiltersStore } from '../app/stores/filters.store'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('filters.store', () => {
  it('starts with no filter applied', () => {
    const store = useFiltersStore()

    expect(store.dateRange).toEqual({ from: null, to: null })
    expect(store.selectedRepo).toBeNull()
    expect(store.selectedContributor).toBeNull()
    expect(store.hasActiveFilters).toBe(false)
  })

  it('sets the date range', () => {
    const store = useFiltersStore()

    store.setDateRange('2026-01-01', '2026-01-31')

    expect(store.dateRange).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(store.hasActiveFilters).toBe(true)
  })

  it('treats a partial date range (only "from" or only "to") as active', () => {
    const store = useFiltersStore()

    store.setDateRange('2026-01-01', null)

    expect(store.dateRange).toEqual({ from: '2026-01-01', to: null })
    expect(store.hasActiveFilters).toBe(true)
  })

  it('sets the selected repo', () => {
    const store = useFiltersStore()

    store.setSelectedRepo('vuejs/core')

    expect(store.selectedRepo).toBe('vuejs/core')
    expect(store.hasActiveFilters).toBe(true)
  })

  it('normalizes the selected repo casing to match repos.store repoKey format', () => {
    const store = useFiltersStore()

    store.setSelectedRepo('Vuejs/Core')

    expect(store.selectedRepo).toBe('vuejs/core')
  })

  it('sets the selected contributor', () => {
    const store = useFiltersStore()

    store.setSelectedContributor('alice')

    expect(store.selectedContributor).toBe('alice')
    expect(store.hasActiveFilters).toBe(true)
  })

  it('resets all filters back to the "no filter" state', () => {
    const store = useFiltersStore()
    store.setDateRange('2026-01-01', '2026-01-31')
    store.setSelectedRepo('vuejs/core')
    store.setSelectedContributor('alice')

    store.resetFilters()

    expect(store.dateRange).toEqual({ from: null, to: null })
    expect(store.selectedRepo).toBeNull()
    expect(store.selectedContributor).toBeNull()
    expect(store.hasActiveFilters).toBe(false)
  })
})
