import { describe, expect, it } from 'vitest'
import { aggregateCommits } from '../app/workers/analytics.worker'

describe('analytics.worker', () => {
  describe('aggregateCommits — day granularity', () => {
    it('fills gaps between the earliest and latest date with zero-count buckets', () => {
      const result = aggregateCommits(
        [{ date: '2026-01-01T10:00:00Z' }, { date: '2026-01-04T22:00:00Z' }, { date: '2026-01-04T23:30:00Z' }],
        'day',
      )

      expect(result.series).toEqual([
        { key: '2026-01-01', count: 1 },
        { key: '2026-01-02', count: 0 },
        { key: '2026-01-03', count: 0 },
        { key: '2026-01-04', count: 2 },
      ])
    })

    it('returns a single bucket when all commits fall on the same day', () => {
      const result = aggregateCommits(
        [{ date: '2026-03-05T01:00:00Z' }, { date: '2026-03-05T23:00:00Z' }],
        'day',
      )

      expect(result.series).toEqual([{ key: '2026-03-05', count: 2 }])
    })

    it('returns an empty series for empty input, with null busiest and zero average', () => {
      const result = aggregateCommits([], 'day')

      expect(result.series).toEqual([])
      expect(result.stats).toEqual({ total: 0, average: 0, busiest: null })
    })

    it('skips entries with an unparseable date instead of throwing', () => {
      const result = aggregateCommits(
        [{ date: '2026-02-01T00:00:00Z' }, { date: 'not-a-date' }, { date: '2026-02-02T00:00:00Z' }],
        'day',
      )

      expect(result.series).toEqual([
        { key: '2026-02-01', count: 1 },
        { key: '2026-02-02', count: 1 },
      ])
    })

    it('skips null, undefined and non-string-date entries instead of throwing', () => {
      const result = aggregateCommits(
        [
          { date: '2026-02-01T00:00:00Z' },
          null as unknown as { date: string },
          undefined as unknown as { date: string },
          { date: 123 as unknown as string },
          { date: '2026-02-02T00:00:00Z' },
        ],
        'day',
      )

      expect(result.series).toEqual([
        { key: '2026-02-01', count: 1 },
        { key: '2026-02-02', count: 1 },
      ])
    })

    it('throws when the earliest and latest dates are too far apart to safely walk day-by-day', () => {
      expect(() =>
        aggregateCommits(
          [{ date: '2026-01-01T00:00:00Z' }, { date: '2040-01-01T00:00:00Z' }],
          'day',
        ),
      ).toThrow(/day range/i)
    })
  })

  describe('aggregateCommits — hour granularity', () => {
    it('always returns all 24 hour buckets, in order, regardless of which hours have data', () => {
      const result = aggregateCommits(
        [{ date: '2026-01-01T05:00:00Z' }, { date: '2026-05-20T05:30:00Z' }, { date: '2026-01-01T18:00:00Z' }],
        'hour',
      )

      expect(result.series).toHaveLength(24)
      expect(result.series.map((bucket) => bucket.key)).toEqual(Array.from({ length: 24 }, (_, hour) => String(hour)))
      expect(result.series[5]).toEqual({ key: '5', count: 2 })
      expect(result.series[18]).toEqual({ key: '18', count: 1 })
      expect(result.series[0]).toEqual({ key: '0', count: 0 })
    })

    it('aggregates hour-of-day across multiple different dates', () => {
      const result = aggregateCommits(
        [{ date: '2026-01-01T09:00:00Z' }, { date: '2026-06-15T09:45:00Z' }, { date: '2026-12-31T09:59:00Z' }],
        'hour',
      )

      expect(result.series[9]).toEqual({ key: '9', count: 3 })
      expect(result.stats.total).toBe(3)
    })

    it('returns all-zero buckets for empty input, without throwing, and a null busiest (no real activity to report)', () => {
      const result = aggregateCommits([], 'hour')

      expect(result.series).toHaveLength(24)
      expect(result.series.every((bucket) => bucket.count === 0)).toBe(true)
      expect(result.stats).toEqual({ total: 0, average: 0, busiest: null })
    })
  })

  describe('stats', () => {
    it('computes total, average and busiest for a simple day series', () => {
      const result = aggregateCommits(
        [
          { date: '2026-01-01T00:00:00Z' },
          { date: '2026-01-02T00:00:00Z' },
          { date: '2026-01-02T00:00:00Z' },
          { date: '2026-01-02T00:00:00Z' },
        ],
        'day',
      )

      expect(result.stats.total).toBe(4)
      expect(result.stats.average).toBe(2) // 4 commits / 2 buckets
      expect(result.stats.busiest).toEqual({ key: '2026-01-02', count: 3 })
    })

    it('picks the first bucket on a tie for busiest', () => {
      const result = aggregateCommits(
        [{ date: '2026-01-01T00:00:00Z' }, { date: '2026-01-02T00:00:00Z' }],
        'day',
      )

      expect(result.stats.busiest).toEqual({ key: '2026-01-01', count: 1 })
    })
  })
})
