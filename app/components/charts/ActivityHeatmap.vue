<script setup lang="ts">
import * as d3 from 'd3'
import { computed, ref, watchEffect } from 'vue'

export interface ActivityHeatmapEntry {
  date: string
  count: number
}

interface Cell {
  date: Date
  dateStr: string
  count: number
  col: number
  row: number
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

const COLOR_ZERO = '#e1e0d9'
const COLOR_STEP_250 = '#86b6ef'
const COLOR_STEP_400 = '#3987e5'
const COLOR_STEP_550 = '#1c5cab'
const COLOR_STEP_700 = '#0d366b'
const SEQUENTIAL_STEPS = [COLOR_STEP_250, COLOR_STEP_400, COLOR_STEP_550, COLOR_STEP_700]
const legendSwatches = [COLOR_ZERO, ...SEQUENTIAL_STEPS]

const parseDate = d3.timeParse('%Y-%m-%d')
const formatKey = d3.timeFormat('%Y-%m-%d')
const formatHuman = d3.timeFormat('%B %-d, %Y')

const svgRef = ref<SVGSVGElement | null>(null)

// One 7×N grid, Sunday-first, ending at the latest activity date (or today) and spanning `weeks` full weeks back.
const cells = computed<Cell[]>(() => {
  const countByDate = new Map<string, number>()
  const parsedDates: Date[] = []

  for (const entry of props.data) {
    const parsed = parseDate(entry.date)
    if (!parsed) continue
    const key = formatKey(parsed)
    // Sum duplicate dates rather than assume the input is already deduplicated.
    countByDate.set(key, (countByDate.get(key) ?? 0) + entry.count)
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
    }
  })
})

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

const cellStep = computed(() => props.cellSize + props.cellGap)
const svgWidth = computed(() => props.weeks * cellStep.value - props.cellGap)
const svgHeight = computed(() => 7 * cellStep.value - props.cellGap)

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

  const step = cellStep.value
  const t = d3.transition().duration(250).ease(d3.easeCubicOut)

  let group = d3.select(svgRef.value).select<SVGGElement>('g.heatmap-cells')
  if (group.empty()) {
    group = d3.select(svgRef.value).append('g').attr('class', 'heatmap-cells')
  }

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
}

// flush: 'post' guarantees svgRef is mounted before the first D3 render.
watchEffect(render, { flush: 'post' })
</script>

<template>
  <div class="w-full">
    <svg ref="svgRef" :width="svgWidth" :height="svgHeight" role="group" :aria-label="heatmapSummary" />
    <div class="mt-2 flex items-center gap-1 text-xs text-[#52514e]">
      <span>Less</span>
      <span
        v-for="swatch in legendSwatches"
        :key="swatch"
        class="inline-block h-2.75 w-2.75 rounded-xs"
        :style="{ backgroundColor: swatch }"
      />
      <span>More</span>
    </div>
  </div>
</template>

<style scoped>
:deep(.heatmap-cell) {
  cursor: pointer;
  outline: none;
  transition: filter 0.15s ease, stroke 0.15s ease;
}

:deep(.heatmap-cell:hover),
:deep(.heatmap-cell:focus) {
  stroke: #1c1c1a;
  stroke-width: 1.5px;
  filter: brightness(1.15);
}
</style>
