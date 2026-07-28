import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChartWorker } from '../app/composables/useChartWorker'
import type { AnalyticsWorkerResponse } from '../app/workers/analytics.worker'

// Minimal stand-in for the DOM Worker constructor, enough to drive the composable's onmessage/onerror handling.
class MockWorker {
  onmessage: ((event: MessageEvent<AnalyticsWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  posted: unknown[] = []

  constructor(public respond: (worker: MockWorker) => void) {}

  postMessage(data: unknown): void {
    this.posted.push(data)
    this.respond(this)
  }

  terminate(): void {
    this.terminated = true
  }
}

function stubWorker(respond: (worker: MockWorker) => void): void {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        return new MockWorker(respond)
      }
    },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useChartWorker', () => {
  describe('fallback path (no Worker available)', () => {
    it('resolves using aggregateCommits directly when Worker is undefined', async () => {
      expect(typeof Worker).toBe('undefined')

      const { aggregate } = useChartWorker()
      const result = await aggregate(
        [{ date: '2026-01-01T00:00:00Z' }, { date: '2026-01-02T00:00:00Z' }],
        'day',
      )

      expect(result.series).toEqual([
        { key: '2026-01-01', count: 1 },
        { key: '2026-01-02', count: 1 },
      ])
      expect(result.stats.total).toBe(2)
    })

    it('rejects with a real Error when the computation itself fails (e.g. day-range cap)', async () => {
      const { aggregate } = useChartWorker()

      await expect(
        aggregate([{ date: '2026-01-01T00:00:00Z' }, { date: '2040-01-01T00:00:00Z' }], 'day'),
      ).rejects.toThrow(/day range/i)
    })
  })

  describe('worker mechanism unavailable', () => {
    it('falls back to the synchronous path when the Worker constructor throws', async () => {
      vi.stubGlobal(
        'Worker',
        class {
          constructor() {
            throw new Error('construction blocked (e.g. CSP)')
          }
        },
      )

      const { aggregate } = useChartWorker()
      const result = await aggregate([{ date: '2026-03-05T00:00:00Z' }], 'day')

      expect(result.series).toEqual([{ key: '2026-03-05', count: 1 }])
    })

    it('falls back to the synchronous path when the worker fires onerror instead of responding', async () => {
      stubWorker((worker) => {
        queueMicrotask(() => worker.onerror?.(new Event('error') as ErrorEvent))
      })

      const { aggregate } = useChartWorker()
      const result = await aggregate([{ date: '2026-03-05T00:00:00Z' }], 'day')

      expect(result.series).toEqual([{ key: '2026-03-05', count: 1 }])
    })

    it('falls back to the synchronous path and terminates the worker when postMessage throws (e.g. DataCloneError)', async () => {
      let spawned: MockWorker | undefined
      vi.stubGlobal(
        'Worker',
        class extends MockWorker {
          constructor() {
            super(() => {})
            spawned = this
          }

          override postMessage(): void {
            throw new Error('DataCloneError: could not be cloned')
          }
        },
      )

      const { aggregate } = useChartWorker()
      const result = await aggregate([{ date: '2026-03-05T00:00:00Z' }], 'day')

      expect(result.series).toEqual([{ key: '2026-03-05', count: 1 }])
      expect(spawned?.terminated).toBe(true)
    })
  })

  describe('worker responds normally', () => {
    it('resolves with the worker result on { ok: true }', async () => {
      stubWorker((worker) => {
        const response: AnalyticsWorkerResponse = {
          ok: true,
          series: [{ key: '2026-03-05', count: 1 }],
          stats: { total: 1, average: 1, busiest: { key: '2026-03-05', count: 1 } },
        }
        queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<AnalyticsWorkerResponse>))
      })

      const { aggregate } = useChartWorker()
      const result = await aggregate([{ date: '2026-03-05T00:00:00Z' }], 'day')

      expect(result).toEqual({
        series: [{ key: '2026-03-05', count: 1 }],
        stats: { total: 1, average: 1, busiest: { key: '2026-03-05', count: 1 } },
      })
    })

    it('rejects with the computed error on { ok: false } instead of retrying via fallback', async () => {
      stubWorker((worker) => {
        const response: AnalyticsWorkerResponse = { ok: false, error: 'Day range too large to aggregate: 9999 days' }
        queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<AnalyticsWorkerResponse>))
      })

      const { aggregate } = useChartWorker()

      await expect(aggregate([{ date: '2026-03-05T00:00:00Z' }], 'day')).rejects.toThrow(
        'Day range too large to aggregate: 9999 days',
      )
    })

    it('terminates the worker once the response arrives', async () => {
      let spawned: MockWorker | undefined
      stubWorker((worker) => {
        spawned = worker
        const response: AnalyticsWorkerResponse = {
          ok: true,
          series: [],
          stats: { total: 0, average: 0, busiest: null },
        }
        queueMicrotask(() => worker.onmessage?.({ data: response } as MessageEvent<AnalyticsWorkerResponse>))
      })

      const { aggregate } = useChartWorker()
      await aggregate([], 'day')

      expect(spawned?.terminated).toBe(true)
    })
  })
})
