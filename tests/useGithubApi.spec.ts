import { describe, expect, it } from 'vitest'
import { GithubApiError, isGithubRateLimitError, toGithubApiError } from '../app/composables/useGithubApi'

// Mirrors ofetch's FetchError shape at runtime without depending on ofetch itself.
function makeFetchError(statusCode: number, data?: unknown, message = 'Request failed') {
  const error = new Error(message) as Error & { statusCode: number; data?: unknown }
  error.statusCode = statusCode
  if (data !== undefined) {
    error.data = data
  }
  return error
}

describe('toGithubApiError', () => {
  it('detects rate-limit errors nested under the Nitro error envelope', () => {
    const error = makeFetchError(429, {
      statusCode: 429,
      statusMessage: 'GitHub API rate limit exceeded',
      data: { error: 'rate_limited', retryAfterSeconds: 30, rateLimitResetAt: 1234567890 },
    })

    const result = toGithubApiError(error, 'repos/vuejs/core')

    expect(result.kind).toBe('rate_limited')
    expect(result.retryAfterSeconds).toBe(30)
    expect(result.rateLimitResetAt).toBe(1234567890)
    expect(isGithubRateLimitError(result)).toBe(true)
  })

  it('treats a 429 without the rate-limit payload as a generic http error', () => {
    const error = makeFetchError(429, { statusCode: 429, statusMessage: 'Too Many Requests' })

    const result = toGithubApiError(error, 'repos/vuejs/core')

    expect(result.kind).toBe('http_error')
    expect(isGithubRateLimitError(result)).toBe(false)
  })

  it('maps other HTTP failures to http_error with the original status code', () => {
    const error = makeFetchError(404, { statusCode: 404, statusMessage: 'Not Found' }, 'Not Found')

    const result = toGithubApiError(error, 'repos/does-not-exist/repo')

    expect(result.kind).toBe('http_error')
    expect(result.statusCode).toBe(404)
  })

  it('falls back to network_error for a thrown value with no statusCode at all', () => {
    const result = toGithubApiError(new TypeError('fetch failed'), 'repos/vuejs/core')

    expect(result.kind).toBe('network_error')
    expect(result.statusCode).toBeUndefined()
  })

  it('falls back to network_error for a genuine ofetch network failure (FetchError with undefined statusCode)', () => {
    // A real network failure: still a FetchError, just with statusCode present but undefined, not a bare TypeError.
    const error = makeFetchError(undefined as unknown as number, undefined, 'fetch failed')

    const result = toGithubApiError(error, 'repos/vuejs/core')

    expect(result.kind).toBe('network_error')
    expect(result.statusCode).toBeUndefined()
  })

  it('always returns a GithubApiError instance', () => {
    expect(toGithubApiError(new Error('boom'), 'x')).toBeInstanceOf(GithubApiError)
  })
})
