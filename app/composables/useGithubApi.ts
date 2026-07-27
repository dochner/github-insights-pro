// Only the fields this dashboard actually reads, not the full GitHub REST v3 (2022-11-28) payloads.

export interface GithubRepo {
  name: string
  full_name: string
  description: string | null
  stargazers_count: number
  language: string | null
  html_url: string
}

export interface GithubCommit {
  sha: string
  commit: {
    message: string
    // Nullable per GitHub's OpenAPI spec (e.g. imported/orphaned commits).
    author: {
      name: string
      date: string
    } | null
  }
  // Null when the commit's email doesn't match a GitHub account.
  author: {
    login: string
    avatar_url: string
  } | null
}

export interface GithubContributor {
  login: string
  avatar_url: string
  contributions: number
}

type GithubApiErrorKind = 'rate_limited' | 'http_error' | 'network_error'

interface GithubRateLimitPayload {
  error: 'rate_limited'
  retryAfterSeconds?: number
  rateLimitResetAt?: number
}

function isGithubRateLimitPayload(value: unknown): value is GithubRateLimitPayload {
  return typeof value === 'object' && value !== null && (value as { error?: unknown }).error === 'rate_limited'
}

interface NitroErrorResponseBody {
  data?: unknown
}

interface FetchErrorLike extends Error {
  statusCode?: number
  data?: NitroErrorResponseBody
}

// `ofetch`'s FetchError isn't imported directly: pnpm doesn't hoist it here since it's only a transitive dep.
function isFetchErrorLike(error: unknown): error is FetchErrorLike {
  return error instanceof Error && 'statusCode' in error
}

// Private constructor forces construction through the static factories below, keeping each `kind`'s fields valid.
export class GithubApiError extends Error {
  readonly kind: GithubApiErrorKind
  readonly statusCode: number | undefined
  readonly retryAfterSeconds: number | undefined
  readonly rateLimitResetAt: number | undefined

  private constructor(
    kind: GithubApiErrorKind,
    message: string,
    statusCode: number | undefined,
    retryAfterSeconds: number | undefined,
    rateLimitResetAt: number | undefined,
    cause: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = 'GithubApiError'
    this.kind = kind
    this.statusCode = statusCode
    this.retryAfterSeconds = retryAfterSeconds
    this.rateLimitResetAt = rateLimitResetAt
  }

  static rateLimited(payload: GithubRateLimitPayload, cause: unknown): GithubApiError {
    return new GithubApiError(
      'rate_limited',
      'GitHub API rate limit exceeded',
      429,
      payload.retryAfterSeconds,
      payload.rateLimitResetAt,
      cause,
    )
  }

  static httpError(statusCode: number | undefined, message: string, cause: unknown): GithubApiError {
    return new GithubApiError('http_error', message, statusCode, undefined, undefined, cause)
  }

  static networkError(message: string, cause: unknown): GithubApiError {
    return new GithubApiError('network_error', message, undefined, undefined, undefined, cause)
  }
}

export function isGithubRateLimitError(error: unknown): error is GithubApiError & { kind: 'rate_limited' } {
  return error instanceof GithubApiError && error.kind === 'rate_limited'
}

// Exported despite being an internal step: it's the pure, Nuxt-runtime-free part that's worth unit-testing.
export function toGithubApiError(error: unknown, path: string): GithubApiError {
  const networkErrorMessage = `Failed to reach the GitHub API proxy while requesting "${path}"`

  if (!isFetchErrorLike(error)) {
    return GithubApiError.networkError(networkErrorMessage, error)
  }

  const statusCode = error.statusCode

  // ofetch throws the same FetchError shape for a real network failure (no response reached), just with statusCode undefined.
  if (statusCode === undefined) {
    return GithubApiError.networkError(networkErrorMessage, error)
  }

  // Nitro wraps `createError({ data })` in its own envelope, so the payload lands at `error.data.data`, not `error.data`.
  const rateLimitPayload = error.data?.data
  if (statusCode === 429 && isGithubRateLimitPayload(rateLimitPayload)) {
    return GithubApiError.rateLimited(rateLimitPayload, error)
  }

  return GithubApiError.httpError(statusCode, error.message || `GitHub API request to "${path}" failed`, error)
}

// `path` has no leading slash, e.g. `repos/vuejs/core/commits` (see server/api/github/[...path].ts).
export async function fetchGithub<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  try {
    return await $fetch<T>(`/api/github/${path}`, {
      ...(query ? { query } : {}),
    })
  } catch (error) {
    throw toGithubApiError(error, path)
  }
}

export function useGithubApi() {
  return { fetchGithub }
}
