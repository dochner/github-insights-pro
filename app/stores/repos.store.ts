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

  async function fetchRepo(owner: string, repo: string): Promise<void> {
    const key = repoKey(owner, repo)
    const requestId = (repoRequestIds[key] ?? 0) + 1
    repoRequestIds[key] = requestId
    repoStatus.value[key] = { loading: true, error: null }
    try {
      const data = await fetchGithub<GithubRepo>(`repos/${owner}/${repo}`)
      if (repoRequestIds[key] !== requestId) return // superseded by a newer call for the same key
      repos.value[key] = data
      repoStatus.value[key] = { loading: false, error: null }
    } catch (error) {
      if (repoRequestIds[key] !== requestId) return
      repoStatus.value[key] = { loading: false, error: toApiError(error) }
    }
  }

  async function fetchCommits(owner: string, repo: string): Promise<void> {
    const key = repoKey(owner, repo)
    const requestId = (commitsRequestIds[key] ?? 0) + 1
    commitsRequestIds[key] = requestId
    commitsStatus.value[key] = { loading: true, error: null }
    try {
      const data = await fetchGithub<GithubCommit[]>(`repos/${owner}/${repo}/commits`)
      if (commitsRequestIds[key] !== requestId) return // superseded by a newer call for the same key
      const shas: string[] = []
      for (const commit of data) {
        commits.value[commit.sha] = commit
        shas.push(commit.sha)
      }
      commitsByRepo.value[key] = shas
      commitsStatus.value[key] = { loading: false, error: null }
    } catch (error) {
      if (commitsRequestIds[key] !== requestId) return
      commitsStatus.value[key] = { loading: false, error: toApiError(error) }
    }
  }

  async function fetchContributors(owner: string, repo: string): Promise<void> {
    const key = repoKey(owner, repo)
    const requestId = (contributorsRequestIds[key] ?? 0) + 1
    contributorsRequestIds[key] = requestId
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
      contributorsStatus.value[key] = { loading: false, error: null }
    } catch (error) {
      if (contributorsRequestIds[key] !== requestId) return
      contributorsStatus.value[key] = { loading: false, error: toApiError(error) }
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
  }
})
