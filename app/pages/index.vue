<script setup lang="ts">
import { computed, defineAsyncComponent, h, onMounted } from 'vue'

// Hardcoded until a RepoSelector exists (out of scope here): vuejs/core fits the dashboard's
// own frontend stack and is consistently active enough to produce a meaningful heatmap.
const OWNER = 'vuejs'
const REPO = 'core'

const reposStore = useReposStore()
const activityKey = repoKey(OWNER, REPO)

onMounted(() => {
  reposStore.fetchCommits(OWNER, REPO)
})

const commitsStatus = computed(() => reposStore.commitsStatusFor(activityKey))

const heatmapData = computed(() => {
  const countsByDay = new Map<string, number>()
  for (const commit of reposStore.commitsForRepo(activityKey)) {
    const date = commit.commit.author?.date
    if (!date) continue // nullable per GitHub's spec for imported/orphaned commits
    const day = date.slice(0, 10) // UTC ISO datetime -> YYYY-MM-DD, no timezone conversion
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1)
  }
  return Array.from(countsByDay, ([date, count]) => ({ date, count }))
})

// Tiny inline functional components — not worth a separate file for a two-line render.
const ChartLoadingState = () => h('p', { class: 'mt-2 text-sm text-[#52514e]' }, 'Loading chart…')
const ChartErrorState = () => h('p', { class: 'mt-2 text-sm text-red-600' }, 'Failed to load the chart. Try refreshing the page.')

// Splits the d3-dependent heatmap into its own chunk; follow this pattern for future chart imports (e.g. CommitTimeline).
const ActivityHeatmap = defineAsyncComponent({
  loader: () => import('~/components/charts/ActivityHeatmap.vue'),
  loadingComponent: ChartLoadingState,
  delay: 200, // avoids a loading flash when the chunk is already cached or loads fast
  errorComponent: ChartErrorState,
  onError(_error, retry, fail, attempts) {
    // Only reachable for a fresh client-side mount (e.g. a future v-if'd chart) — during SSR hydration a chunk-fetch failure never reaches this callback, so app/plugins/chunk-reload.client.ts handles that case globally via the vite:preloadError event instead.
    if (attempts <= 1) retry()
    else fail()
  },
})
</script>

<template>
  <main class="min-h-screen p-8">
    <h1 class="text-2xl font-semibold">GitHub Insights Pro</h1>

    <section class="mt-6">
      <h2 class="text-sm font-medium text-[#52514e]">Activity — {{ OWNER }}/{{ REPO }}</h2>

      <p v-if="commitsStatus.loading" class="mt-2 text-sm text-[#52514e]">Loading commit activity…</p>
      <p v-else-if="commitsStatus.error" class="mt-2 text-sm text-red-600">
        {{
          isGithubRateLimitError(commitsStatus.error)
            ? 'GitHub API rate limit exceeded. Please try again shortly.'
            : 'Failed to load commit activity.'
        }}
      </p>
      <ActivityHeatmap v-else class="mt-2" :data="heatmapData" />
    </section>
  </main>
</template>

<style scoped></style>
