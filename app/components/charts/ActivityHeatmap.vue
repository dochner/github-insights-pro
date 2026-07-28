<script setup lang="ts">
import * as d3 from 'd3'
import { computed, ref, watchEffect } from 'vue'

export interface ActivityHeatmapCommit {
  sha: string
  message: string
}

export interface ActivityHeatmapEntry {
  date: string
  count: number
  /** Optional: when omitted the component still renders fine from aggregate counts alone, just without the hover popover. */
  commits?: ActivityHeatmapCommit[]
}

interface Cell {
  date: Date
  dateStr: string
  count: number
  col: number
  row: number
  commits: ActivityHeatmapCommit[]
}

interface AxisLabel {
  col: number
  label: string
}

interface RowLabel {
  row: number
  label: string
}

const props = withDefaults(
  defineProps<{
    data: ActivityHeatmapEntry[]
    weeks?: number
    cellSize?: number
    cellGap?: number
  }>(),
  {
    weeks: 52,
    cellSize: 11,
    cellGap: 2,
  }
)

// Single-hue green ramp (terminal/GitHub-activity feel) — keep in sync with app/assets/css/main.css's
// --paper/--green tokens. D3 sets these as raw SVG attributes, not CSS classes, so they're plain JS constants.
const COLOR_ZERO = 'rgba(230, 228, 221, 0.08)' // --paper at ~8% opacity: a barely-visible "no activity" tint
const COLOR_STEP_LOW = '#173b22'
const COLOR_STEP_MID = '#1f6b34'
const COLOR_STEP_HIGH = '#2d9a44'
const COLOR_STEP_MAX = '#3fb950' // --green at full strength
const SEQUENTIAL_STEPS = [COLOR_STEP_LOW, COLOR_STEP_MID, COLOR_STEP_HIGH, COLOR_STEP_MAX]
const legendSwatches = [COLOR_ZERO, ...SEQUENTIAL_STEPS]

const MAX_POPOVER_COMMITS = 8
const POPOVER_WIDTH = 220

// Fixed pixel budget for the month/day-of-week axis labels; the grid itself is offset by this.
const margin = { top: 16, left: 26 }

const parseDate = d3.timeParse('%Y-%m-%d')
const formatKey = d3.timeFormat('%Y-%m-%d')
const formatHuman = d3.timeFormat('%B %-d, %Y')
const formatMonth = d3.timeFormat('%b')

const svgRef = ref<SVGSVGElement | null>(null)
const activeDateStr = ref<string | null>(null)

// One 7×N grid, Sunday-first, ending at the latest activity date (or today) and spanning `weeks` full weeks back.
const cells = computed<Cell[]>(() => {
  const countByDate = new Map<string, number>()
  const commitsByDate = new Map<string, ActivityHeatmapCommit[]>()
  const parsedDates: Date[] = []

  for (const entry of props.data) {
    const parsed = parseDate(entry.date)
    if (!parsed) continue
    const key = formatKey(parsed)
    // Sum duplicate dates rather than assume the input is already deduplicated.
    countByDate.set(key, (countByDate.get(key) ?? 0) + entry.count)
    if (entry.commits && entry.commits.length > 0) {
      commitsByDate.set(key, [...(commitsByDate.get(key) ?? []), ...entry.commits])
    }
    parsedDates.push(parsed)
  }

  const latest = parsedDates.length ? (d3.max(parsedDates) as Date) : new Date()
  const latestWeekStart = d3.timeWeek.floor(latest)
  const windowStart = d3.timeWeek.offset(latestWeekStart, -(props.weeks - 1))
  const windowEnd = d3.timeDay.offset(latestWeekStart, 6)

  return d3.timeDays(windowStart, d3.timeDay.offset(windowEnd, 1)).map((day) => {
    const key = formatKey(day)
    const dayIndex = d3.timeDay.count(windowStart, day)
    return {
      date: day,
      dateStr: key,
      count: countByDate.get(key) ?? 0,
      col: Math.floor(dayIndex / 7),
      row: day.getDay(),
      commits: commitsByDate.get(key) ?? [],
    }
  })
})

const activeCellData = computed<Cell | null>(() => {
  if (!activeDateStr.value) return null
  return cells.value.find((c) => c.dateStr === activeDateStr.value) ?? null
})

const visibleCommits = computed(() => activeCellData.value?.commits.slice(0, MAX_POPOVER_COMMITS) ?? [])
const hiddenCommitCount = computed(() => Math.max(0, (activeCellData.value?.commits.length ?? 0) - MAX_POPOVER_COMMITS))

// Columns where a new month's first day falls, for the top axis labels. Computed from actual dates
// (not a fixed week-interval guess) so it stays correct regardless of which weekday the 1st lands on.
const monthLabels = computed<AxisLabel[]>(() => {
  const byCol = new Map<number, Cell[]>()
  for (const cell of cells.value) {
    const arr = byCol.get(cell.col)
    if (arr) arr.push(cell)
    else byCol.set(cell.col, [cell])
  }
  const cols = Array.from(byCol.keys()).sort((a, b) => a - b)
  const labels: AxisLabel[] = []
  for (const col of cols) {
    const firstOfMonth = byCol.get(col)!.find((c) => c.date.getDate() === 1)
    if (firstOfMonth) labels.push({ col, label: formatMonth(firstOfMonth.date) })
  }
  // The very first column rarely contains a literal "1st" — label it too so the chart never opens unlabeled.
  if (cols.length > 0 && !labels.some((l) => l.col === cols[0])) {
    const first = byCol.get(cols[0]!)![0]
    if (first) labels.unshift({ col: cols[0]!, label: formatMonth(first.date) })
  }
  return labels
})

// Mon/Wed/Fri only, matching the density GitHub's own heatmap uses to avoid a cramped left rail.
const dayLabels = computed<RowLabel[]>(() => [
  { row: 1, label: 'Mon' },
  { row: 3, label: 'Wed' },
  { row: 5, label: 'Fri' },
])

// scaleQuantize over the actual data extent (not fixed thresholds or quantiles) keeps the ramp meaningful for both quiet and very active repos.
const positiveExtent = computed<[number, number]>(() => {
  const positive = cells.value.map((c) => c.count).filter((c) => c > 0)
  if (positive.length === 0) return [0, 1]
  const [min, max] = d3.extent(positive) as [number, number]
  return min === max ? [0, max] : [min, max]
})

const colorScale = computed(() => d3.scaleQuantize<string>().domain(positiveExtent.value).range(SEQUENTIAL_STEPS))

function colorFor(count: number): string {
  return count === 0 ? COLOR_ZERO : colorScale.value(count)
}

function tooltipText(cell: Cell): string {
  const dateLabel = formatHuman(cell.date)
  const countLabel = cell.count === 0 ? 'No contributions' : cell.count === 1 ? '1 contribution' : `${cell.count} contributions`
  return `${dateLabel}: ${countLabel}`
}

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message
}

const activeCellDescription = computed(() => {
  const cell = activeCellData.value
  if (!cell) return ''
  const base = tooltipText(cell)
  if (cell.commits.length === 0) return base
  const lines = visibleCommits.value.map((c) => `${shortSha(c.sha)} ${firstLine(c.message)}`)
  return `${base}. ${lines.join('; ')}`
})

const cellStep = computed(() => props.cellSize + props.cellGap)
const gridWidth = computed(() => props.weeks * cellStep.value - props.cellGap)
const gridHeight = computed(() => 7 * cellStep.value - props.cellGap)
const svgWidth = computed(() => margin.left + gridWidth.value)
const svgHeight = computed(() => margin.top + gridHeight.value)

const popoverStyle = computed(() => {
  const cell = activeCellData.value
  if (!cell || cell.commits.length === 0) return null
  const step = cellStep.value
  const cellX = margin.left + cell.col * step
  const cellY = margin.top + cell.row * step
  const overflowsRight = cellX + POPOVER_WIDTH + 12 > svgWidth.value
  const left = overflowsRight ? cellX - POPOVER_WIDTH - 8 : cellX + props.cellSize + 8
  const top = Math.max(0, cellY - 4)
  return { left: `${left}px`, top: `${top}px`, width: `${POPOVER_WIDTH}px` }
})

const heatmapSummary = computed(() => {
  const first = cells.value[0]
  const last = cells.value[cells.value.length - 1]
  if (!first || !last) return 'Activity heatmap'
  const total = cells.value.reduce((sum, c) => sum + c.count, 0)
  const totalLabel = total === 1 ? '1 contribution' : `${total} contributions`
  return `Activity heatmap from ${formatHuman(first.date)} to ${formatHuman(last.date)}: ${totalLabel}`
})

type CellSelection = d3.Selection<SVGRectElement, Cell, SVGGElement, unknown>

// Title text (accessible name + native tooltip) is set via D3's .text(), never innerHTML.
function applyCellContent(selection: CellSelection): void {
  selection.each(function (this: SVGRectElement, d) {
    const rect = d3.select<SVGRectElement, Cell>(this)
    const label = tooltipText(d)
    let title = rect.select<SVGTitleElement>('title')
    if (title.empty()) title = rect.append<SVGTitleElement>('title')
    title.text(label)
    rect.attr('aria-label', label)
  })
}

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
}

// Matches by col/row (not DOM order) since D3's join order doesn't track visual grid position.
function focusNeighborCell(group: d3.Selection<SVGGElement, unknown, null, undefined>, current: Cell, key: string): void {
  const delta = ARROW_DELTAS[key]
  if (!delta) return
  const targetCol = current.col + delta[0]
  const targetRow = current.row + delta[1]
  const targetNode = group
    .selectAll<SVGRectElement, Cell>('rect.heatmap-cell')
    .filter((c) => c.col === targetCol && c.row === targetRow)
    .node()
  targetNode?.focus()
}

// Real D3 selection/data-join against the raw SVG DOM (not a Vue v-for) — this is the project's
// deliberate proof of low-level D3 control: enter/update/exit with genuine transitions.
function render(): void {
  if (!svgRef.value) return

  const svg = d3.select(svgRef.value)
  const step = cellStep.value
  const t = d3.transition().duration(250).ease(d3.easeCubicOut)

  let group = svg.select<SVGGElement>('g.heatmap-cells')
  if (group.empty()) {
    group = svg.append('g').attr('class', 'heatmap-cells')
  }
  group.attr('transform', `translate(${margin.left},${margin.top})`)

  group
    .selectAll<SVGRectElement, Cell>('rect.heatmap-cell')
    .data(cells.value, (d) => (d as Cell).dateStr)
    .join(
      (enter) => {
        const rects: CellSelection = enter
          .append('rect')
          .attr('class', 'heatmap-cell')
          .attr('tabindex', 0)
          .attr('rx', 2)
          .attr('width', props.cellSize)
          .attr('height', props.cellSize)
          .attr('x', (d) => d.col * step)
          .attr('y', (d) => d.row * step)
          .attr('fill', (d) => colorFor(d.count))
          .attr('opacity', 0)
        rects.call(applyCellContent)
        rects.on('keydown', function (event: KeyboardEvent, d: Cell) {
          if (!ARROW_DELTAS[event.key]) return
          event.preventDefault()
          focusNeighborCell(group, d, event.key)
        })
        rects
          .on('mouseenter', function (this: SVGRectElement, _event: MouseEvent, d: Cell) {
            activeDateStr.value = d.dateStr
          })
          .on('mouseleave', function (this: SVGRectElement, _event: MouseEvent, d: Cell) {
            if (activeDateStr.value === d.dateStr) activeDateStr.value = null
          })
          .on('focus', function (this: SVGRectElement, _event: FocusEvent, d: Cell) {
            activeDateStr.value = d.dateStr
          })
          .on('blur', function (this: SVGRectElement, _event: FocusEvent, d: Cell) {
            if (activeDateStr.value === d.dateStr) activeDateStr.value = null
          })
        rects.transition(t).attr('opacity', 1)
        return rects
      },
      (update) => {
        update.call(applyCellContent)
        update
          .transition(t)
          .attr('x', (d) => d.col * step)
          .attr('y', (d) => d.row * step)
          .attr('width', props.cellSize)
          .attr('height', props.cellSize)
          .attr('fill', (d) => colorFor(d.count))
        return update
      },
      (exit) => exit.transition(t).attr('opacity', 0).remove()
    )

  let monthGroup = svg.select<SVGGElement>('g.month-labels')
  if (monthGroup.empty()) monthGroup = svg.append('g').attr('class', 'month-labels')
  monthGroup.attr('transform', `translate(${margin.left},0)`)
  monthGroup
    .selectAll<SVGTextElement, AxisLabel>('text.month-label')
    .data(monthLabels.value, (d) => `${(d as AxisLabel).col}`)
    .join(
      (enter) =>
        enter
          .append('text')
          .attr('class', 'month-label')
          .attr('x', (d) => d.col * step)
          .attr('y', margin.top - 4)
          .text((d) => d.label),
      (update) => update.attr('x', (d) => d.col * step).text((d) => d.label),
      (exit) => exit.remove()
    )

  let dayGroup = svg.select<SVGGElement>('g.day-labels')
  if (dayGroup.empty()) dayGroup = svg.append('g').attr('class', 'day-labels')
  dayGroup.attr('transform', `translate(0,${margin.top})`)
  dayGroup
    .selectAll<SVGTextElement, RowLabel>('text.day-label')
    .data(dayLabels.value, (d) => `${(d as RowLabel).row}`)
    .join(
      (enter) =>
        enter
          .append('text')
          .attr('class', 'day-label')
          .attr('text-anchor', 'end')
          .attr('x', margin.left - 6)
          .attr('y', (d) => d.row * step + props.cellSize / 2 + 3)
          .text((d) => d.label),
      (update) => update.attr('y', (d) => d.row * step + props.cellSize / 2 + 3).text((d) => d.label),
      (exit) => exit.remove()
    )
}

// flush: 'post' guarantees svgRef is mounted before the first D3 render.
watchEffect(render, { flush: 'post' })
</script>

<template>
  <div class="relative w-full">
    <svg ref="svgRef" :width="svgWidth" :height="svgHeight" role="group" :aria-label="heatmapSummary" />
    <div class="legend mt-2 flex items-center gap-1 text-xs">
      <span>Less</span>
      <span
        v-for="swatch in legendSwatches"
        :key="swatch"
        class="inline-block h-2.75 w-2.75 rounded-xs"
        :style="{ backgroundColor: swatch }"
      />
      <span>More</span>
    </div>
    <div v-if="popoverStyle" class="heatmap-popover" :style="popoverStyle">
      <p class="popover-date">{{ formatHuman(activeCellData!.date) }}</p>
      <ul class="popover-commits">
        <li v-for="c in visibleCommits" :key="c.sha">
          <span class="popover-sha">{{ shortSha(c.sha) }}</span> {{ firstLine(c.message) }}
        </li>
      </ul>
      <p v-if="hiddenCommitCount > 0" class="popover-more">+{{ hiddenCommitCount }} more</p>
    </div>
    <div class="sr-only" aria-live="polite">{{ activeCellDescription }}</div>
  </div>
</template>

<style scoped>
.legend {
  color: rgb(from var(--paper) r g b / 55%);
  font-family: var(--font-sans);
}

:deep(.heatmap-cell) {
  cursor: pointer;
  outline: none;
  transform-box: fill-box;
  transform-origin: center;
  transition: filter 0.15s ease, stroke 0.15s ease, transform 0.15s ease;
}

:deep(.heatmap-cell:hover),
:deep(.heatmap-cell:focus) {
  stroke: var(--accent);
  stroke-width: 1.5px;
  filter: brightness(1.15);
  transform: scale(1.25);
}

:deep(.month-label),
:deep(.day-label) {
  font-family: var(--font-sans);
  font-size: 9px;
  fill: rgb(from var(--paper) r g b / 55%);
}

.heatmap-popover {
  position: absolute;
  z-index: 10;
  background: var(--ink);
  border: 1px solid var(--hairline);
  padding: 0.5rem 0.6rem;
  pointer-events: none;
}

.popover-date {
  color: var(--paper);
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 500;
  margin-bottom: 0.3rem;
}

.popover-commits {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.popover-commits li {
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.popover-sha {
  color: var(--accent);
}

.popover-more {
  color: rgb(from var(--paper) r g b / 55%);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  margin-top: 0.3rem;
}
</style>
