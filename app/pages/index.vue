<script setup lang="ts">
import { computed, defineAsyncComponent, h, onMounted, ref } from 'vue'
import type { ActivityHeatmapCommit, ActivityHeatmapEntry } from '~/components/charts/ActivityHeatmap.vue'
import type { CommitTimelineEntry } from '~/components/charts/CommitTimeline.vue'
import type { FetchOptions } from '~/stores/repos.store'
import type { GithubCommit } from '~/composables/useGithubApi'

const DEFAULT_OWNER = 'vuejs'
const DEFAULT_REPO = 'core'

const reposStore = useReposStore()
const filtersStore = useFiltersStore()

const activeOwnerRepo = computed<{ owner: string; repo: string }>(() => {
  const selected = filtersStore.selectedRepo
  if (selected) {
    const [owner, repo] = selected.split('/')
    if (owner && repo) return { owner, repo }
  }
  return { owner: DEFAULT_OWNER, repo: DEFAULT_REPO }
})

const activityKey = computed(() => repoKey(activeOwnerRepo.value.owner, activeOwnerRepo.value.repo))

function loadRepo(owner: string, repo: string, options: FetchOptions = {}): void {
  reposStore.fetchRepo(owner, repo, options)
  reposStore.fetchCommits(owner, repo, options)
  reposStore.fetchContributors(owner, repo, options)
}

onMounted(() => {
  if (!filtersStore.selectedRepo) {
    filtersStore.setSelectedRepo(repoKey(DEFAULT_OWNER, DEFAULT_REPO))
  }
  loadRepo(DEFAULT_OWNER, DEFAULT_REPO)
})

// RepoSelector's "Load" is an explicit user action: if this key was already cached from a prior
// selection, force a refetch rather than silently serving stale TTL-cached data.
function onRepoSelect(owner: string, repo: string): void {
  const key = repoKey(owner, repo)
  const alreadyCached = reposStore.commitsByRepo[key] !== undefined
  filtersStore.setSelectedRepo(key)
  loadRepo(owner, repo, alreadyCached ? { force: true } : {})
}

const commitsStatus = computed(() => reposStore.commitsStatusFor(activityKey.value))
const contributorsStatus = computed(() => reposStore.contributorsStatusFor(activityKey.value))

const commitList = computed(() => reposStore.commitsForRepo(activityKey.value))

const heatmapData = computed<ActivityHeatmapEntry[]>(() => {
  const byDay = new Map<string, { count: number; commits: ActivityHeatmapCommit[] }>()
  for (const commit of commitList.value) {
    const date = commit.commit.author?.date
    if (!date) continue // nullable per GitHub's spec for imported/orphaned commits
    const day = date.slice(0, 10) // UTC ISO datetime -> YYYY-MM-DD, no timezone conversion
    const entry = byDay.get(day) ?? { count: 0, commits: [] }
    entry.count += 1
    entry.commits.push({ sha: commit.sha, message: commit.commit.message })
    byDay.set(day, entry)
  }
  return Array.from(byDay, ([date, { count, commits }]) => ({ date, count, commits }))
})

const timelineCommits = computed<CommitTimelineEntry[]>(() =>
  commitList.value
    .filter((c): c is GithubCommit & { commit: { author: { date: string } } } => Boolean(c.commit.author?.date))
    .map((c) => ({ date: c.commit.author.date }))
)

// Total commits reflects only what's been fetched (one page from the commits endpoint), not the repo's true lifetime total.
const totalCommits = computed(() => commitList.value.length)

const currentStreak = computed(() =>
  calculateCurrentStreak(
    commitList.value
      .map((c) => c.commit.author?.date?.slice(0, 10))
      .filter((d): d is string => Boolean(d))
  )
)

const activeContributors = computed(() => reposStore.contributorsForRepo(activityKey.value).length)

const totalCommitsDisplay = computed<string | number>(() => (commitsStatus.value.loading ? '—' : totalCommits.value))
const currentStreakDisplay = computed<string | number>(() => (commitsStatus.value.loading ? '—' : currentStreak.value))
const activeContributorsDisplay = computed<string | number>(() =>
  contributorsStatus.value.loading ? '—' : activeContributors.value
)

// FilterBar's date range only narrows the recent-commits list below — the heatmap and timeline keep their
// own window-calculation logic untouched (deeper change, out of scope for this pass).
const filteredCommits = computed<GithubCommit[]>(() => {
  const { from, to } = filtersStore.dateRange
  if (!from && !to) return commitList.value
  return commitList.value.filter((c) => {
    const day = c.commit.author?.date?.slice(0, 10)
    if (!day) return false
    if (from && day < from) return false
    if (to && day > to) return false
    return true
  })
})

function commitRowKey(item: GithubCommit): string {
  return item.sha
}

// CommitTimeline already accepts a numeric `width` prop for exactly this — measuring the container
// makes it genuinely full-width instead of a fixed 720px default.
const timelineContainerRef = ref<HTMLElement | null>(null)
const { width: timelineMeasuredWidth } = useChartResize(timelineContainerRef)
const timelineWidth = computed(() => timelineMeasuredWidth.value || 720)
// ~240px: tall enough for the line/area shape to read clearly, short enough to stay a supporting
// chart under the heatmap hero rather than competing with it for vertical space.
const TIMELINE_HEIGHT = 240

const ChartLoadingState = () => h('p', { class: 'muted-text text-sm' }, 'Loading chart…')
const ChartErrorState = () => h('p', { class: 'error-text text-sm' }, 'Failed to load the chart. Try refreshing the page.')

// Splits each d3-dependent chart into its own chunk (aggressive code-splitting per the project's stated goals).
const ActivityHeatmapAsync = defineAsyncComponent({
  loader: () => import('~/components/charts/ActivityHeatmap.vue'),
  loadingComponent: ChartLoadingState,
  delay: 200,
  errorComponent: ChartErrorState,
  onError(_error, retry, fail, attempts) {
    if (attempts <= 1) retry()
    else fail()
  },
})

const CommitTimelineAsync = defineAsyncComponent({
  loader: () => import('~/components/charts/CommitTimeline.vue'),
  loadingComponent: ChartLoadingState,
  delay: 200,
  errorComponent: ChartErrorState,
  onError(_error, retry, fail, attempts) {
    if (attempts <= 1) retry()
    else fail()
  },
})
</script>

<template>
  <div>
    <header class="dashboard-header sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-8 py-4">
      <DashboardRepoSelector :model-value="`${activeOwnerRepo.owner}/${activeOwnerRepo.repo}`" @select="onRepoSelect" />
      <DashboardFilterBar />
    </header>

    <main class="px-8 py-8">
      <h1 class="page-title text-2xl font-semibold">GitHub Insights Pro</h1>
      <p class="page-subtitle mt-1 text-sm">
        Activity — <span class="font-mono">{{ activityKey }}</span>
      </p>

      <section class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div class="flex flex-row flex-wrap gap-4 lg:flex-col">
          <DashboardStatCard :value="totalCommitsDisplay" label="Total commits (loaded)" />
          <DashboardStatCard :value="currentStreakDisplay" label="Current streak (days)" />
          <DashboardStatCard :value="activeContributorsDisplay" label="Active contributors" />
        </div>

        <div>
          <p v-if="commitsStatus.loading" class="muted-text text-sm">Loading commit activity…</p>
          <p v-else-if="commitsStatus.error" class="error-text text-sm">
            {{
              isGithubRateLimitError(commitsStatus.error)
                ? 'GitHub API rate limit exceeded. Please try again shortly.'
                : 'Failed to load commit activity.'
            }}
          </p>
          <ActivityHeatmapAsync v-else :data="heatmapData" />
        </div>
      </section>

      <section ref="timelineContainerRef" class="mt-10 w-full">
        <h2 class="section-label text-sm font-medium">Commit timeline</h2>
        <CommitTimelineAsync class="mt-2" :commits="timelineCommits" :width="timelineWidth" :height="TIMELINE_HEIGHT" />
      </section>

      <section class="mt-10">
        <h2 class="section-label text-sm font-medium">Recent commits</h2>
        <p class="muted-text mt-1 text-xs">
          <template v-if="filtersStore.dateRange.from || filtersStore.dateRange.to">
            Filtered to the date range selected above.
          </template>
          <template v-else> Showing all currently-loaded commits, most recent first. </template>
        </p>
        <DashboardVirtualizedList
          class="commit-list mt-2"
          :items="filteredCommits"
          :item-height="44"
          :height="420"
          :get-key="commitRowKey"
        >
          <template #default="{ item }">
            <div class="commit-row">
              <span class="commit-sha font-mono">{{ item.sha.slice(0, 7) }}</span>
              <span class="commit-author font-sans">{{ item.author?.login ?? item.commit.author?.name ?? 'unknown' }}</span>
              <span class="commit-message font-sans">{{ item.commit.message.split('\n')[0] }}</span>
              <span class="commit-date font-mono">{{ item.commit.author?.date?.slice(0, 10) ?? '—' }}</span>
            </div>
          </template>
        </DashboardVirtualizedList>
      </section>
    </main>
  </div>
</template>

<style scoped>
.dashboard-header {
  background: var(--ink);
  border-bottom: 1px solid var(--hairline);
}

.page-title {
  color: var(--paper);
}

.page-subtitle {
  color: rgb(from var(--paper) r g b / 60%);
}

.section-label {
  color: rgb(from var(--paper) r g b / 70%);
}

.muted-text {
  color: rgb(from var(--paper) r g b / 55%);
}

.error-text {
  color: var(--red);
}

.commit-list {
  border: 1px solid var(--hairline);
}

.commit-row {
  display: flex;
  height: 100%;
  align-items: center;
  gap: 1rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--hairline);
}

.commit-sha {
  flex: 0 0 5.5rem;
  color: var(--accent);
  font-size: 0.8rem;
}

.commit-author {
  flex: 0 0 9rem;
  overflow: hidden;
  color: var(--paper);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}

.commit-message {
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--paper);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}

.commit-date {
  flex: 0 0 6rem;
  color: rgb(from var(--paper) r g b / 60%);
  text-align: right;
  font-size: 0.8rem;
}
</style>
