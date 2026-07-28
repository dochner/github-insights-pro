import type {
  AggregationInput,
  AggregationResult,
  AnalyticsWorkerRequest,
  AnalyticsWorkerResponse,
  Granularity,
} from '../workers/analytics.worker'
import { aggregateCommits } from '../workers/analytics.worker'

export interface UseChartWorkerReturn {
  aggregate: (commits: AggregationInput[], granularity: Granularity) => Promise<AggregationResult>
}

// Runs the same pure function the worker uses, so a legitimate computed error (e.g. day-range cap) matches either path.
function runFallback(commits: AggregationInput[], granularity: Granularity): Promise<AggregationResult> {
  try {
    return Promise.resolve(aggregateCommits(commits, granularity))
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }
}

// One worker per call, terminated after its single response — no request-ID correlation needed since no worker ever sees a second request.
function runInWorker(commits: AggregationInput[], granularity: Granularity): Promise<AggregationResult> {
  return new Promise((resolve, reject) => {
    let settled = false

    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/analytics.worker', import.meta.url), { type: 'module' })
    } catch {
      // Worker construction itself failed — mechanism unavailable, fall back.
      runFallback(commits, granularity).then(resolve, reject)
      return
    }

    const cleanup = () => {
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    }

    worker.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      // Script failed to load/run inside the worker — mechanism broken, not a computed error. Fall back.
      runFallback(commits, granularity).then(resolve, reject)
    }

    worker.onmessage = (event: MessageEvent<AnalyticsWorkerResponse>) => {
      if (settled) return
      settled = true
      cleanup()
      const response = event.data
      if (response.ok) {
        resolve({ series: response.series, stats: response.stats })
      } else {
        // aggregateCommits threw inside the worker — the fallback would hit the same error, so surface it instead of retrying.
        reject(new Error(response.error))
      }
    }

    const request: AnalyticsWorkerRequest = { commits, granularity }
    try {
      worker.postMessage(request)
    } catch {
      if (settled) return
      settled = true
      cleanup()
      // e.g. DataCloneError from non-cloneable input — mechanism failure, fall back.
      runFallback(commits, granularity).then(resolve, reject)
    }
  })
}

export function useChartWorker(): UseChartWorkerReturn {
  function aggregate(commits: AggregationInput[], granularity: Granularity): Promise<AggregationResult> {
    // No Worker constructor at all (SSR, or an unsupported client) — skip straight to the synchronous path.
    if (typeof Worker === 'undefined') {
      return runFallback(commits, granularity)
    }
    return runInWorker(commits, granularity)
  }

  return { aggregate }
}
