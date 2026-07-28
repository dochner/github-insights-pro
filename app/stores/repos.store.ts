import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  fetchGithub,
  GithubApiError,
  type GithubCommit,
  type GithubContributor,
  type GithubRepo,
} from '../composables/useGithubApi'

export interface ResourceStatus {
  loading: boolean
  error: GithubApiError | null
}

const idleStatus: ResourceStatus = { loading: false, error: null }

// 5 minutes: keeps repeat dashboard interactions off the GitHub rate limit while staying fresh enough for a "live-ish" view.
const CACHE_TTL_MS = 5 * 60 * 1000

export interface FetchOptions {
  force?: boolean
  since?: string
}

// GitHub's commits endpoint defaults to per_page=30, single page, with no total-count field — that alone
// was the heatmap bug (~4 distinct days out of a 364-day window for an active repo). Page at the API max
// instead and keep requesting until a page comes back short, which is the only page-count-free way to
// detect "last page" without parsing the `Link` header (fetchGithub only returns parsed JSON, not headers).
const COMMITS_PER_PAGE = 100
// 5 pages (<=500 commits) keeps even very active repos (vuejs/core) dense enough to fill the heatmap
// while bounding worst-case requests per dashboard load — important for GitHub's 60/hour unauthenticated cap.
const MAX_COMMITS_PAGES = 5
// Matches ActivityHeatmap's own default `weeks` prop, kept as an independent constant here (the store
// shouldn't import a component just to reuse its default).
const COMMITS_DEFAULT_WINDOW_WEEKS = 52
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function defaultCommitsSince(): string {
  return new Date(Date.now() - COMMITS_DEFAULT_WINDOW_WEEKS * MS_PER_WEEK).toISOString()
}

// Canonical lookup key (from request args, not response's `full_name`); lowercased since GitHub lookups are case-insensitive.
export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase()
}

// fetchGithub always rejects with a GithubApiError already; this is just a defensive fallback.
function toApiError(error: unknown): GithubApiError {
  return error instanceof GithubApiError
    ? error
    : GithubApiError.networkError('Unexpected error while calling the GitHub API', error)
}

export const useReposStore = defineStore('repos', () => {
  const repos = ref<Record<string, GithubRepo>>({})
  const commits = ref<Record<string, GithubCommit>>({})
  const commitsByRepo = ref<Record<string, string[]>>({})
  const contributors = ref<Record<string, GithubContributor>>({})
  const contributorsByRepo = ref<Record<string, string[]>>({})

  const repoStatus = ref<Record<string, ResourceStatus>>({})
  const commitsStatus = ref<Record<string, ResourceStatus>>({})
  const contributorsStatus = ref<Record<string, ResourceStatus>>({})

  // Per-key request counters so a slower, superseded call can't overwrite a newer one's result (not reactive state).
  const repoRequestIds: Record<string, number> = {}
  const commitsRequestIds: Record<string, number> = {}
  const contributorsRequestIds: Record<string, number> = {}

  // Last-successful-fetch timestamp per key, per resource; drives the TTL skip check (not reactive state, mirrors the request-id maps above).
  const repoFetchedAt: Record<string, number> = {}
  const commitsFetchedAt: Record<string, number> = {}
  const contributorsFetchedAt: Record<string, number> = {}

  // Bumped by invalidateX; lets a fetch detect it was invalidated mid-flight so its response can't resurrect a stale TTL.
  const repoInvalidationGen: Record<string, number> = {}
  const commitsInvalidationGen: Record<string, number> = {}
  const contributorsInvalidationGen: Record<string, number> = {}

  const repoStatusFor = computed(() => (key: string): ResourceStatus => repoStatus.value[key] ?? idleStatus)
  const commitsStatusFor = computed(() => (key: string): ResourceStatus => commitsStatus.value[key] ?? idleStatus)
  const contributorsStatusFor = computed(
    () => (key: string): ResourceStatus => contributorsStatus.value[key] ?? idleStatus,
  )

  const repoList = computed(() => Object.values(repos.value))

  const repoByKey = computed(() => (key: string): GithubRepo | undefined => repos.value[key])

  const commitsForRepo = computed(() => (key: string): GithubCommit[] => {
    const shas = commitsByRepo.value[key] ?? []
    const result: GithubCommit[] = []
    for (const sha of shas) {
      const commit = commits.value[sha]
      if (commit) {
        result.push(commit)
      }
    }
    return result
  })

  const contributorsForRepo = computed(() => (key: string): GithubContributor[] => {
    const logins = contributorsByRepo.value[key] ?? []
    const result: GithubContributor[] = []
    for (const login of logins) {
      const contributor = contributors.value[login]
      if (contributor) {
        result.push(contributor)
      }
    }
    return result
  })

  function isFresh(fetchedAt: number | undefined): boolean {
    return fetchedAt !== undefined && Date.now() - fetchedAt < CACHE_TTL_MS
  }

  async function fetchRepo(owner: string, repo: string, options: FetchOptions = {}): Promise<void> {
    const key = repoKey(owner, repo)
    if (!options.force && repos.value[key] !== undefined && !repoStatus.value[key]?.loading && isFresh(repoFetchedAt[key])) {
      return // cache hit within TTL: skip the network call entirely, state untouched
    }
    const requestId = (repoRequestIds[key] ?? 0) + 1
    repoRequestIds[key] = requestId
    const invalidationGenAtStart = repoInvalidationGen[key] ?? 0
    repoStatus.value[key] = { loading: true, error: null }
    try {
      const data = await fetchGithub<GithubRepo>(`repos/${owner}/${repo}`)
      if (repoRequestIds[key] !== requestId) return // superseded by a newer call for the same key
      repos.value[key] = data
      // Only stamp fresh if nothing invalidated this key while the request was in flight.
      if ((repoInvalidationGen[key] ?? 0) === invalidationGenAtStart) {
        repoFetchedAt[key] = Date.now()
      }
      repoStatus.value[key] = { loading: false, error: null }
    } catch (error) {
      if (repoRequestIds[key] !== requestId) return
      repoStatus.value[key] = { loading: false, error: toApiError(error) }
    }
  }

  async function fetchCommits(owner: string, repo: string, options: FetchOptions = {}): Promise<void> {
    const key = repoKey(owner, repo)
    if (!options.force && commitsByRepo.value[key] !== undefined && !commitsStatus.value[key]?.loading && isFresh(commitsFetchedAt[key])) {
      return // cache hit within TTL: skip the network call entirely, state untouched
    }
    const requestId = (commitsRequestIds[key] ?? 0) + 1
    commitsRequestIds[key] = requestId
    const invalidationGenAtStart = commitsInvalidationGen[key] ?? 0
    commitsStatus.value[key] = { loading: true, error: null }
    const since = options.since ?? defaultCommitsSince()
    try {
      // One logical fetch spanning several HTTP requests: requestId is issued once above, not per page.
      const allCommits: GithubCommit[] = []
      for (let page = 1; page <= MAX_COMMITS_PAGES; page += 1) {
        const data = await fetchGithub<GithubCommit[]>(`repos/${owner}/${repo}/commits`, {
          per_page: COMMITS_PER_PAGE,
          since,
          page,
        })
        // Re-checked after every page (not just once at the end) so a superseded call stops
        // issuing further page requests instead of continuing to fetch pages nobody wants.
        if (commitsRequestIds[key] !== requestId) return
        allCommits.push(...data)
        if (data.length < COMMITS_PER_PAGE) break // short (or empty) page: this was the last one
      }
      const shas: string[] = []
      for (const commit of allCommits) {
        commits.value[commit.sha] = commit
        shas.push(commit.sha)
      }
      commitsByRepo.value[key] = shas
      // Only stamp fresh if nothing invalidated this key while the request was in flight.
      if ((commitsInvalidationGen[key] ?? 0) === invalidationGenAtStart) {
        commitsFetchedAt[key] = Date.now()
      }
      commitsStatus.value[key] = { loading: false, error: null }
    } catch (error) {
      if (commitsRequestIds[key] !== requestId) return
      commitsStatus.value[key] = { loading: false, error: toApiError(error) }
    }
  }

  async function fetchContributors(owner: string, repo: string, options: FetchOptions = {}): Promise<void> {
    const key = repoKey(owner, repo)
    if (
      !options.force
      && contributorsByRepo.value[key] !== undefined
      && !contributorsStatus.value[key]?.loading
      && isFresh(contributorsFetchedAt[key])
    ) {
      return // cache hit within TTL: skip the network call entirely, state untouched
    }
    const requestId = (contributorsRequestIds[key] ?? 0) + 1
    contributorsRequestIds[key] = requestId
    const invalidationGenAtStart = contributorsInvalidationGen[key] ?? 0
    contributorsStatus.value[key] = { loading: true, error: null }
    try {
      const data = await fetchGithub<GithubContributor[]>(`repos/${owner}/${repo}/contributors`)
      if (contributorsRequestIds[key] !== requestId) return // superseded by a newer call for the same key
      const logins: string[] = []
      for (const contributor of data) {
        contributors.value[contributor.login] = contributor
        logins.push(contributor.login)
      }
      contributorsByRepo.value[key] = logins
      // Only stamp fresh if nothing invalidated this key while the request was in flight.
      if ((contributorsInvalidationGen[key] ?? 0) === invalidationGenAtStart) {
        contributorsFetchedAt[key] = Date.now()
      }
      contributorsStatus.value[key] = { loading: false, error: null }
    } catch (error) {
      if (contributorsRequestIds[key] !== requestId) return
      contributorsStatus.value[key] = { loading: false, error: toApiError(error) }
    }
  }

  // Clears the timestamp (stale data stays visible) and bumps the generation so an in-flight fetch can't silently re-stamp it fresh.
  function invalidateRepo(key: string): void {
    delete repoFetchedAt[key]
    repoInvalidationGen[key] = (repoInvalidationGen[key] ?? 0) + 1
  }

  function invalidateCommits(key: string): void {
    delete commitsFetchedAt[key]
    commitsInvalidationGen[key] = (commitsInvalidationGen[key] ?? 0) + 1
  }

  function invalidateContributors(key: string): void {
    delete contributorsFetchedAt[key]
    contributorsInvalidationGen[key] = (contributorsInvalidationGen[key] ?? 0) + 1
  }

  // Full cache reset; iterates the request-id maps (not fetchedAt) so it also covers keys currently in flight with no prior success.
  function invalidateAll(): void {
    for (const key of Object.keys(repoFetchedAt)) delete repoFetchedAt[key]
    for (const key of Object.keys(commitsFetchedAt)) delete commitsFetchedAt[key]
    for (const key of Object.keys(contributorsFetchedAt)) delete contributorsFetchedAt[key]
    for (const key of Object.keys(repoRequestIds)) repoInvalidationGen[key] = (repoInvalidationGen[key] ?? 0) + 1
    for (const key of Object.keys(commitsRequestIds)) commitsInvalidationGen[key] = (commitsInvalidationGen[key] ?? 0) + 1
    for (const key of Object.keys(contributorsRequestIds)) {
      contributorsInvalidationGen[key] = (contributorsInvalidationGen[key] ?? 0) + 1
    }
  }

  return {
    repos,
    commits,
    commitsByRepo,
    contributors,
    contributorsByRepo,
    repoStatus,
    commitsStatus,
    contributorsStatus,
    repoStatusFor,
    commitsStatusFor,
    contributorsStatusFor,
    repoList,
    repoByKey,
    commitsForRepo,
    contributorsForRepo,
    fetchRepo,
    fetchCommits,
    fetchContributors,
    invalidateRepo,
    invalidateCommits,
    invalidateContributors,
    invalidateAll,
  }
})
