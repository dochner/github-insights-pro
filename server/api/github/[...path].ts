// Hides the token (runtimeConfig.githubToken) from the client

interface GithubRateLimitErrorData {
  error: 'rate_limited'
  retryAfterSeconds?: number
  rateLimitResetAt?: number
}

const GITHUB_API_BASE = 'https://api.github.com'

const RATE_LIMIT_HEADERS_TO_FORWARD = ['x-ratelimit-remaining', 'x-ratelimit-reset'] as const

// Explicit return type breaks a circular-inference error Nitro's typed-router hits on catch-all routes.
export default defineEventHandler(async (event): Promise<unknown> => {
  const path = getRouterParam(event, 'path')
  if (!path) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing GitHub API path',
    })
  }

  // This dashboard only ever reads GitHub data — the proxy must not become
  // a generic passthrough that lets any client spend the server's token on
  // write requests (create/delete repos, issues, etc.).
  const method = event.method
  if (method !== 'GET' && method !== 'HEAD') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed',
    })
  }

  const { githubToken } = useRuntimeConfig(event)
  const { search } = getRequestURL(event)
  const upstreamUrl = `${GITHUB_API_BASE}/${path}${search}`

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub rejects unauthenticated requests without a descriptive UA.
    'User-Agent': 'github-insights-pro',
  }
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  let response: Awaited<ReturnType<typeof $fetch.raw>>
  try {
    response = await $fetch.raw(upstreamUrl, {
      method,
      headers,
      // Resolve regardless of status so rate-limit/error bodies can be
      // inspected and reshaped instead of being thrown as opaque FetchErrors.
      ignoreResponseError: true,
    })
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to reach GitHub API',
    })
  }

  for (const headerName of RATE_LIMIT_HEADERS_TO_FORWARD) {
    const value = response.headers.get(headerName)
    if (value !== null) {
      setResponseHeader(event, headerName, value)
    }
  }

  const isRateLimitStatus = response.status === 403 || response.status === 429
  const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
  const retryAfterHeader = response.headers.get('retry-after')
  const isRateLimited = isRateLimitStatus && (rateLimitRemaining === '0' || retryAfterHeader !== null)

  if (isRateLimited) {
    const rateLimitResetHeader = response.headers.get('x-ratelimit-reset')
    const retryAfterSeconds = retryAfterHeader !== null ? Number(retryAfterHeader) : undefined
    const rateLimitResetAt = rateLimitResetHeader !== null ? Number(rateLimitResetHeader) : undefined

    const data: GithubRateLimitErrorData = {
      error: 'rate_limited',
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(rateLimitResetAt !== undefined ? { rateLimitResetAt } : {}),
    }

    throw createError({
      statusCode: 429,
      statusMessage: 'GitHub API rate limit exceeded',
      data,
    })
  }

  setResponseStatus(event, response.status, response.statusText)
  return response._data
})
