import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { GithubCommit, GithubContributor, GithubRepo } from '../app/composables/useGithubApi'

vi.mock('../app/composables/useGithubApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/composables/useGithubApi')>()
  return { ...actual, fetchGithub: vi.fn() }
})

const { fetchGithub, GithubApiError } = await import('../app/composables/useGithubApi')
const { useReposStore, repoKey } = await import('../app/stores/repos.store')

const mockedFetchGithub = vi.mocked(fetchGithub)

function makeRepo(overrides: Partial<GithubRepo> = {}): GithubRepo {
  return {
    name: 'core',
    full_name: 'vuejs/core',
    description: null,
    stargazers_count: 42,
    language: 'TypeScript',
    html_url: 'https://github.com/vuejs/core',
    ...overrides,
  }
}

function makeCommit(sha: string, login: string): GithubCommit {
  return {
    sha,
    commit: { message: `commit ${sha}`, author: { name: 'Alice', date: '2026-01-01T00:00:00Z' } },
    author: { login, avatar_url: `https://example.com/${login}.png` },
  }
}

function makeContributor(login: string, contributions: number): GithubContributor {
  return { login, avatar_url: `https://example.com/${login}.png`, contributions }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockedFetchGithub.mockReset()
})

describe('repos.store', () => {
  it('normalizes a fetched repo under the owner/repo key', async () => {
    mockedFetchGithub.mockResolvedValueOnce(makeRepo())
    const store = useReposStore()

    await store.fetchRepo('vuejs', 'core')

    const key = repoKey('vuejs', 'core')
    expect(store.repos[key]).toEqual(makeRepo())
    expect(store.repoStatusFor(key)).toEqual({ loading: false, error: null })
  })

  it('sets loading true while a repo fetch is in flight', () => {
    let resolveFetch!: (value: GithubRepo) => void
    mockedFetchGithub.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve }))
    const store = useReposStore()

    const pending = store.fetchRepo('vuejs', 'core')

    expect(store.repoStatusFor(repoKey('vuejs', 'core')).loading).toBe(true)
    resolveFetch(makeRepo())
    return pending
  })

  it('normalizes commits by sha and tracks per-repo ordering', async () => {
    const commits = [makeCommit('sha1', 'alice'), makeCommit('sha2', 'bob')]
    mockedFetchGithub.mockResolvedValueOnce(commits)
    const store = useReposStore()

    await store.fetchCommits('vuejs', 'core')

    const key = repoKey('vuejs', 'core')
    expect(store.commits.sha1).toEqual(commits[0])
    expect(store.commits.sha2).toEqual(commits[1])
    expect(store.commitsByRepo[key]).toEqual(['sha1', 'sha2'])
    expect(store.commitsForRepo(key)).toEqual(commits)
  })

  it('keeps a shared commit as a single normalized entry across two repos', async () => {
    const shared = makeCommit('shared-sha', 'alice')
    mockedFetchGithub.mockResolvedValueOnce([shared])
    mockedFetchGithub.mockResolvedValueOnce([shared])
    const store = useReposStore()

    await store.fetchCommits('vuejs', 'core')
    await store.fetchCommits('vuejs', 'router')

    expect(Object.keys(store.commits)).toEqual(['shared-sha'])
    expect(store.commitsForRepo(repoKey('vuejs', 'core'))[0]).toBe(store.commitsForRepo(repoKey('vuejs', 'router'))[0])
  })

  it('normalizes contributors by login', async () => {
    const contributors = [makeContributor('alice', 100), makeContributor('bob', 50)]
    mockedFetchGithub.mockResolvedValueOnce(contributors)
    const store = useReposStore()

    await store.fetchContributors('vuejs', 'core')

    const key = repoKey('vuejs', 'core')
    expect(store.contributors.alice).toEqual(contributors[0])
    expect(store.contributorsByRepo[key]).toEqual(['alice', 'bob'])
    expect(store.contributorsForRepo(key)).toEqual(contributors)
  })

  it('records a GithubApiError on the resource status without throwing', async () => {
    const rateLimitError = GithubApiError.rateLimited({ error: 'rate_limited', retryAfterSeconds: 30 }, undefined)
    mockedFetchGithub.mockRejectedValueOnce(rateLimitError)
    const store = useReposStore()

    await expect(store.fetchRepo('vuejs', 'core')).resolves.toBeUndefined()

    const status = store.repoStatusFor(repoKey('vuejs', 'core'))
    expect(status.loading).toBe(false)
    expect(status.error?.kind).toBe('rate_limited')
  })

  it('keeps commits/contributors loading state independent per resource', () => {
    let resolveCommits!: (value: GithubCommit[]) => void
    mockedFetchGithub.mockReturnValueOnce(new Promise((resolve) => { resolveCommits = resolve }))
    const store = useReposStore()

    const pending = store.fetchCommits('vuejs', 'core')
    const key = repoKey('vuejs', 'core')

    expect(store.commitsStatusFor(key).loading).toBe(true)
    expect(store.contributorsStatusFor(key).loading).toBe(false)
    resolveCommits([])
    return pending
  })

  it('returns an idle status for a repo that was never fetched', () => {
    const store = useReposStore()
    expect(store.repoStatusFor('unknown/unknown')).toEqual({ loading: false, error: null })
  })

  it('normalizes owner/repo casing to the same key', () => {
    expect(repoKey('Vuejs', 'Core')).toBe(repoKey('vuejs', 'core'))
  })

  it('discards a stale response when a repo is re-fetched before the first call resolves', async () => {
    let resolveFirst!: (value: GithubCommit[]) => void
    let resolveSecond!: (value: GithubCommit[]) => void
    mockedFetchGithub.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
    mockedFetchGithub.mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))
    const store = useReposStore()
    const key = repoKey('vuejs', 'core')

    const firstCall = store.fetchCommits('vuejs', 'core')
    const secondCall = store.fetchCommits('vuejs', 'core')

    const freshCommit = makeCommit('fresh-sha', 'bob')
    resolveSecond([freshCommit])
    await secondCall

    const staleCommit = makeCommit('stale-sha', 'alice')
    resolveFirst([staleCommit])
    await firstCall

    expect(store.commitsByRepo[key]).toEqual(['fresh-sha'])
    expect(store.commitsForRepo(key)).toEqual([freshCommit])
    expect(store.commitsStatusFor(key)).toEqual({ loading: false, error: null })
  })
})
