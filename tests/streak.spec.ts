import { describe, expect, it } from 'vitest'
import { calculateCurrentStreak } from '../app/utils/streak'

describe('calculateCurrentStreak', () => {
  it('returns 0 for no active days', () => {
    expect(calculateCurrentStreak([])).toBe(0)
  })

  it('returns 1 for a single active day', () => {
    expect(calculateCurrentStreak(['2026-07-20'])).toBe(1)
  })

  it('counts consecutive days ending at the most recent active day', () => {
    expect(calculateCurrentStreak(['2026-07-18', '2026-07-19', '2026-07-20'])).toBe(3)
  })

  it('stops counting at the first gap walking backward', () => {
    // gap on 07-17 breaks the streak; only 18/19/20 count even though 15/16 are also active.
    expect(calculateCurrentStreak(['2026-07-15', '2026-07-16', '2026-07-18', '2026-07-19', '2026-07-20'])).toBe(3)
  })

  it('is unaffected by input order', () => {
    expect(calculateCurrentStreak(['2026-07-20', '2026-07-18', '2026-07-19'])).toBe(3)
  })

  it('deduplicates repeated day keys (multiple commits per day) without inflating the streak', () => {
    expect(calculateCurrentStreak(['2026-07-20', '2026-07-20', '2026-07-19', '2026-07-19'])).toBe(2)
  })

  it('counts backward from the most recent active day, not from today, when the repo has gone idle', () => {
    // Last activity is a week "in the past" relative to nothing "today"-related — streak is still 2, ending there.
    expect(calculateCurrentStreak(['2026-01-01', '2026-01-02'])).toBe(2)
  })

  it('handles a month/year boundary correctly', () => {
    expect(calculateCurrentStreak(['2025-12-30', '2025-12-31', '2026-01-01'])).toBe(3)
  })

  it('does not count a single active day surrounded by non-consecutive noise as more than 1', () => {
    expect(calculateCurrentStreak(['2026-07-10', '2026-07-20'])).toBe(1)
  })
})
