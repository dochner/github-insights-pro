<script setup lang="ts">
import { computed, onMounted } from 'vue'

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
      <ChartsActivityHeatmap v-else class="mt-2" :data="heatmapData" />
    </section>
  </main>
</template>

<style scoped></style>
