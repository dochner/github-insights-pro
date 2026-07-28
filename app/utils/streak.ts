// Pure function, no store/composable dependency, so it's cheap to unit test at its boundaries.

/**
 * Counts consecutive calendar days with at least one commit, walking backward from the most
 * recent day that has any activity (not necessarily "today" — a repo idle for a week still
 * reports the streak that led up to its last active day).
 *
 * @param activeDayStrings YYYY-MM-DD day keys, duplicates and any order allowed.
 */
export function calculateCurrentStreak(activeDayStrings: Iterable<string>): number {
  const days = new Set(activeDayStrings)
  if (days.size === 0) return 0

  const mostRecent = Array.from(days).sort().at(-1)!
  const cursor = new Date(`${mostRecent}T00:00:00Z`)
  let streak = 0

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return streak
}
