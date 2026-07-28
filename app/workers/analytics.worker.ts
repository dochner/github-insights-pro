/// <reference lib="webworker" />

export type Granularity = 'day' | 'hour'

export interface AggregationInput {
  date: string
}

export interface AggregationBucket {
  key: string
  count: number
}

export interface AggregationStats {
  total: number
  average: number
  busiest: AggregationBucket | null
}

export interface AggregationResult {
  series: AggregationBucket[]
  stats: AggregationStats
}

export interface AnalyticsWorkerRequest {
  commits: AggregationInput[]
  granularity: Granularity
}

export type AnalyticsWorkerResponse = ({ ok: true } & AggregationResult) | { ok: false; error: string }

// ~10 years: a sane cap on the day-walk below so one malformed, wildly out-of-range date can't turn it into a multi-million-iteration loop.
const MAX_DAY_RANGE = 3660

function aggregateByDay(commits: AggregationInput[]): AggregationBucket[] {
  const countsByDay = new Map<string, number>()
  let first: string | undefined
  let last: string | undefined

  for (const commit of commits) {
    if (typeof commit?.date !== 'string' || Number.isNaN(Date.parse(commit.date))) continue
    const day = commit.date.slice(0, 10) // UTC ISO datetime -> YYYY-MM-DD, matches index.vue's heatmap aggregation
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1)
    if (!first || day < first) first = day
    if (!last || day > last) last = day
  }

  if (!first || !last) return []

  const cursor = new Date(`${first}T00:00:00Z`)
  const end = new Date(`${last}T00:00:00Z`)
  const dayRange = Math.round((end.getTime() - cursor.getTime()) / 86_400_000)
  if (dayRange > MAX_DAY_RANGE) {
    throw new Error(`Day range too large to aggregate: ${dayRange} days (max ${MAX_DAY_RANGE})`)
  }

  const series: AggregationBucket[] = []
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10)
    series.push({ key, count: countsByDay.get(key) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return series
}

function aggregateByHour(commits: AggregationInput[]): AggregationBucket[] {
  const countsByHour = new Map<number, number>()
  for (const commit of commits) {
    if (typeof commit?.date !== 'string') continue
    const timestamp = Date.parse(commit.date)
    if (Number.isNaN(timestamp)) continue
    const hour = new Date(timestamp).getUTCHours()
    countsByHour.set(hour, (countsByHour.get(hour) ?? 0) + 1)
  }
  // Always all 24 buckets, so hour granularity never has the "gap" problem day granularity has.
  return Array.from({ length: 24 }, (_, hour) => ({ key: String(hour), count: countsByHour.get(hour) ?? 0 }))
}

function buildStats(series: AggregationBucket[]): AggregationStats {
  const total = series.reduce((sum, bucket) => sum + bucket.count, 0)
  const average = series.length > 0 ? total / series.length : 0
  // No activity at all (e.g. all-zero hour buckets) means "no busiest bucket", not an arbitrary first one.
  const busiest = total > 0
    ? series.reduce<AggregationBucket | null>(
        (max, bucket) => (max === null || bucket.count > max.count ? bucket : max),
        null,
      )
    : null
  return { total, average, busiest }
}

export function aggregateCommits(commits: AggregationInput[], granularity: Granularity): AggregationResult {
  const series = granularity === 'day' ? aggregateByDay(commits) : aggregateByHour(commits)
  return { series, stats: buildStats(series) }
}

// Guard against overwriting window.onmessage if this module is ever imported on the main thread (e.g. for the fallback path).
if (typeof DedicatedWorkerGlobalScope !== 'undefined' && self instanceof DedicatedWorkerGlobalScope) {
  self.onmessage = (event: MessageEvent<AnalyticsWorkerRequest>) => {
    try {
      const { commits, granularity } = event.data
      const result = aggregateCommits(commits, granularity)
      const response: AnalyticsWorkerResponse = { ok: true, ...result }
      self.postMessage(response)
    } catch (error) {
      const response: AnalyticsWorkerResponse = { ok: false, error: error instanceof Error ? error.message : String(error) }
      self.postMessage(response)
    }
  }
}
