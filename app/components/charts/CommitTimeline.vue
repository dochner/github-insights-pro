<script setup lang="ts">
import * as d3 from 'd3'
import { computed, ref, watch, watchEffect } from 'vue'
import type { AggregationResult, Granularity } from '../../workers/analytics.worker'

export interface CommitTimelineEntry {
  date: string
}

interface Point {
  key: string
  count: number
  x: number // day: epoch ms; hour: 0-23
}

type XScaleInfo =
  | { kind: 'day'; scale: d3.ScaleTime<number, number> }
  | { kind: 'hour'; scale: d3.ScaleLinear<number, number> }

const props = withDefaults(
  defineProps<{
    commits: CommitTimelineEntry[]
    granularity?: Granularity
    width?: number
    height?: number
  }>(),
  {
    granularity: 'day',
    width: 720,
    height: 240,
  }
)

const LINE_COLOR = '#2a78d6'

const margin = { top: 12, right: 16, bottom: 28, left: 40 }

const parseDay = d3.timeParse('%Y-%m-%d')
const formatDayTick = d3.timeFormat('%b %-d')
const formatDayLabel = d3.timeFormat('%B %-d, %Y')

const svgRef = ref<SVGSVGElement | null>(null)

const loading = ref(true)
const error = ref<string | null>(null)
const result = ref<AggregationResult | null>(null)
const ready = computed(() => !loading.value && !error.value && result.value !== null)

const activePointIndex = ref(-1)

// Guards against a stale aggregate() resolving after a newer commits/granularity change already started — same class of race repos.store.ts fixes with request-id tracking.
let callToken = 0
async function runAggregate(): Promise<void> {
  const token = ++callToken
  loading.value = true
  error.value = null
  try {
    const data = await useChartWorker().aggregate(props.commits, props.granularity)
    if (token !== callToken) return
    result.value = data
    loading.value = false
  } catch (err) {
    if (token !== callToken) return
    error.value = err instanceof Error ? err.message : String(err)
    loading.value = false
  }
}

watch(() => [props.commits, props.granularity], runAggregate, { immediate: true })

const points = computed<Point[]>(() => {
  if (!result.value) return []
  if (props.granularity === 'hour') {
    return result.value.series.map((bucket) => ({ key: bucket.key, count: bucket.count, x: Number(bucket.key) }))
  }
  const parsed: Point[] = []
  for (const bucket of result.value.series) {
    const day = parseDay(bucket.key)
    if (!day) continue
    parsed.push({ key: bucket.key, count: bucket.count, x: day.getTime() })
  }
  return parsed
})

const innerWidth = computed(() => Math.max(0, props.width - margin.left - margin.right))
const innerHeight = computed(() => Math.max(0, props.height - margin.top - margin.bottom))

const xScaleInfo = computed<XScaleInfo>(() => {
  if (props.granularity === 'hour') {
    return { kind: 'hour', scale: d3.scaleLinear().domain([0, 23]).range([0, innerWidth.value]) }
  }
  const xs = points.value.map((p) => p.x)
  const extent: [number, number] = xs.length ? (d3.extent(xs) as [number, number]) : [Date.now(), Date.now()]
  const [min, max] = extent
  const domainMax = max === min ? min + 86_400_000 : max
  return { kind: 'day', scale: d3.scaleTime().domain([new Date(min), new Date(domainMax)]).range([0, innerWidth.value]) }
})

function xPixel(p: Point): number {
  const info = xScaleInfo.value
  return info.kind === 'day' ? info.scale(new Date(p.x)) : info.scale(p.x)
}

const yScale = computed(() => {
  const maxCount = d3.max(points.value, (p) => p.count) ?? 0
  return d3.scaleLinear().domain([0, maxCount || 1]).nice().range([innerHeight.value, 0])
})

const lineGenerator = computed(() =>
  d3
    .line<Point>()
    .x((p) => xPixel(p))
    .y((p) => yScale.value(p.count))
    .curve(d3.curveMonotoneX)
)

const areaGenerator = computed(() =>
  d3
    .area<Point>()
    .x((p) => xPixel(p))
    .y0(innerHeight.value)
    .y1((p) => yScale.value(p.count))
    .curve(d3.curveMonotoneX)
)

function pointLabel(p: Point): string {
  if (props.granularity === 'hour') return `${String(p.x).padStart(2, '0')}:00`
  return formatDayLabel(new Date(p.x))
}

function tooltipText(p: Point): string {
  const countLabel = p.count === 1 ? '1 commit' : `${p.count} commits`
  return `${pointLabel(p)}: ${countLabel}`
}

const activePointDescription = computed(() => {
  const p = points.value[activePointIndex.value]
  return p ? tooltipText(p) : ''
})

const svgSummary = computed(() => {
  const pts = points.value
  if (pts.length === 0) return 'Commit timeline'
  const total = result.value?.stats.total ?? 0
  const totalLabel = total === 1 ? '1 commit' : `${total} commits`
  return `Commit timeline from ${pointLabel(pts[0]!)} to ${pointLabel(pts[pts.length - 1]!)}: ${totalLabel}`
})

function crosshairSel() {
  if (!svgRef.value) return null
  const sel = d3.select(svgRef.value).select<SVGGElement>('g.plot > g.crosshair')
  return sel.empty() ? null : sel
}

function showCrosshairAt(index: number): void {
  const pts = points.value
  const sel = crosshairSel()
  if (!sel || index < 0 || index >= pts.length) return
  const p = pts[index]!
  const cx = xPixel(p)
  const cy = yScale.value(p.count)

  sel.style('display', null)
  sel.select('line.crosshair-line').attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', innerHeight.value)
  sel.select('circle.crosshair-dot').attr('cx', cx).attr('cy', cy)

  const tooltipGroup = sel.select<SVGGElement>('g.crosshair-tooltip')
  const labelText = tooltipGroup.select<SVGTextElement>('text.tooltip-label').text(pointLabel(p))
  const valueText = tooltipGroup
    .select<SVGTextElement>('text.tooltip-value')
    .text(p.count === 1 ? '1 commit' : `${p.count} commits`)

  const labelNode = labelText.node()
  const valueNode = valueText.node()
  const textWidth = Math.max(labelNode?.getComputedTextLength() ?? 0, valueNode?.getComputedTextLength() ?? 0)
  const boxWidth = textWidth + 16
  const boxHeight = 38
  const boxX = cx + boxWidth + 10 > innerWidth.value ? cx - boxWidth - 10 : cx + 10
  const boxY = Math.max(0, cy - boxHeight - 10)

  tooltipGroup.attr('transform', `translate(${boxX},${boxY})`)
  tooltipGroup.select('rect.tooltip-bg').attr('width', boxWidth).attr('height', boxHeight)
  labelText.attr('x', 8)
  valueText.attr('x', 8)

  activePointIndex.value = index
}

function hideCrosshair(): void {
  crosshairSel()?.style('display', 'none')
  activePointIndex.value = -1
}

function nearestIndex(mouseX: number): number {
  const pts = points.value
  if (pts.length === 0) return -1
  const xs = pts.map((p) => xPixel(p))
  const i = d3.bisectLeft(xs, mouseX)
  if (i <= 0) return 0
  if (i >= xs.length) return xs.length - 1
  return mouseX - xs[i - 1]! <= xs[i]! - mouseX ? i - 1 : i
}

function onOverlayPointerMove(event: PointerEvent): void {
  if (!svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left - margin.left
  const index = nearestIndex(mouseX)
  if (index >= 0) showCrosshairAt(index)
}

// Real D3 selection/data-join against the raw SVG DOM (not a Vue v-for), same architectural
// choice as ActivityHeatmap.vue — this project's deliberate proof of low-level D3 control.
function render(): void {
  if (!svgRef.value || !ready.value) return

  const svg = d3.select(svgRef.value)
  let plot = svg.select<SVGGElement>('g.plot')
  if (plot.empty()) plot = svg.append('g').attr('class', 'plot')
  plot.attr('transform', `translate(${margin.left},${margin.top})`)

  const t = d3.transition().duration(200).ease(d3.easeCubicOut)
  const info = xScaleInfo.value
  const ys = yScale.value

  let gridGroup = plot.select<SVGGElement>('g.gridlines')
  if (gridGroup.empty()) gridGroup = plot.append('g').attr('class', 'gridlines')
  gridGroup
    .transition(t)
    .call(
      d3
        .axisLeft(ys)
        .tickSize(-innerWidth.value)
        .ticks(5)
        .tickFormat(() => '')
    )
  gridGroup.select('.domain').remove()

  let xAxisGroup = plot.select<SVGGElement>('g.x-axis')
  if (xAxisGroup.empty()) xAxisGroup = plot.append('g').attr('class', 'axis x-axis')
  xAxisGroup.attr('transform', `translate(0,${innerHeight.value})`)
  if (info.kind === 'day') {
    const tickCount = Math.max(2, Math.min(8, Math.floor(innerWidth.value / 90)))
    xAxisGroup.transition(t).call(d3.axisBottom<Date>(info.scale).ticks(tickCount).tickFormat(formatDayTick))
  } else {
    const tickCount = Math.max(4, Math.min(12, Math.floor(innerWidth.value / 60)))
    xAxisGroup.transition(t).call(
      d3
        .axisBottom<number>(info.scale)
        .ticks(tickCount)
        .tickFormat((d) => `${d}h`)
    )
  }

  let yAxisGroup = plot.select<SVGGElement>('g.y-axis')
  if (yAxisGroup.empty()) yAxisGroup = plot.append('g').attr('class', 'axis y-axis')
  yAxisGroup.transition(t).call(d3.axisLeft(ys).ticks(5).tickFormat(d3.format('d')))
  yAxisGroup.select('.domain').remove()

  let areaPath = plot.select<SVGPathElement>('path.area')
  if (areaPath.empty()) {
    areaPath = plot.append('path').attr('class', 'area').attr('opacity', 0)
    areaPath.transition(t).attr('opacity', 1)
  }
  areaPath.attr('d', areaGenerator.value(points.value))

  let linePath = plot.select<SVGPathElement>('path.line')
  if (linePath.empty()) {
    linePath = plot.append('path').attr('class', 'line').attr('opacity', 0)
    linePath.transition(t).attr('opacity', 1)
  }
  linePath.attr('d', lineGenerator.value(points.value))

  let hitGroup = plot.select<SVGGElement>('g.hit-points')
  if (hitGroup.empty()) hitGroup = plot.append('g').attr('class', 'hit-points')

  hitGroup
    .selectAll<SVGCircleElement, Point>('circle.hit-point')
    .data(points.value, (d) => (d as Point).key)
    .join(
      (enter) => {
        const circles = enter
          .append('circle')
          .attr('class', 'hit-point')
          .attr('tabindex', 0)
          .attr('r', 8)
          .attr('cx', (d) => xPixel(d))
          .attr('cy', (d) => ys(d.count))

        circles.each(function (d) {
          d3.select(this).append('title').text(tooltipText(d))
        })

        circles
          .on('focus', function (this: SVGCircleElement, _event: FocusEvent, d: Point) {
            showCrosshairAt(points.value.findIndex((p) => p.key === d.key))
          })
          .on('blur', () => hideCrosshair())
          .on('keydown', function (this: SVGCircleElement, event: KeyboardEvent, d: Point) {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            event.preventDefault()
            const currentIndex = points.value.findIndex((p) => p.key === d.key)
            const nextIndex =
              event.key === 'ArrowRight'
                ? Math.min(currentIndex + 1, points.value.length - 1)
                : Math.max(currentIndex - 1, 0)
            const nextKey = points.value[nextIndex]?.key
            const nextNode = hitGroup
              .selectAll<SVGCircleElement, Point>('circle.hit-point')
              .filter((p) => p.key === nextKey)
              .node()
            nextNode?.focus()
          })

        return circles
      },
      (update) => {
        update.attr('cx', (d) => xPixel(d)).attr('cy', (d) => ys(d.count))
        update.each(function (d) {
          d3.select(this).select<SVGTitleElement>('title').text(tooltipText(d))
        })
        return update
      },
      (exit) => exit.remove()
    )

  let overlay = plot.select<SVGRectElement>('rect.overlay')
  if (overlay.empty()) {
    overlay = plot
      .append('rect')
      .attr('class', 'overlay')
      .on('pointermove', onOverlayPointerMove)
      .on('pointerleave', () => hideCrosshair())
  }
  overlay.attr('x', 0).attr('y', 0).attr('width', innerWidth.value).attr('height', innerHeight.value)

  let crosshair = plot.select<SVGGElement>('g.crosshair')
  if (crosshair.empty()) {
    crosshair = plot.append('g').attr('class', 'crosshair').style('display', 'none')
    crosshair.append('line').attr('class', 'crosshair-line')
    crosshair.append('circle').attr('class', 'crosshair-dot').attr('r', 4.5)
    const tooltipGroup = crosshair.append('g').attr('class', 'crosshair-tooltip')
    tooltipGroup.append('rect').attr('class', 'tooltip-bg').attr('rx', 4)
    tooltipGroup.append('text').attr('class', 'tooltip-label').attr('y', 14)
    tooltipGroup.append('text').attr('class', 'tooltip-value').attr('y', 30)
  } else {
    crosshair.raise()
  }
}

// flush: 'post' guarantees svgRef is mounted before the first D3 render.
watchEffect(render, { flush: 'post' })
</script>

<template>
  <div class="w-full">
    <p v-if="loading" class="text-sm text-[#52514e]">Loading commit activity…</p>
    <p v-else-if="error" class="text-sm text-red-600">Failed to load commit activity.</p>
    <template v-else>
      <p v-if="points.length === 0" class="text-sm text-[#52514e]">No commit activity to display.</p>
      <svg v-else ref="svgRef" :width="width" :height="height" role="group" :aria-label="svgSummary" />
    </template>
    <div class="sr-only" aria-live="polite">{{ activePointDescription }}</div>
  </div>
</template>

<style scoped>
:deep(.gridlines line) {
  stroke: #e1e0d9;
  shape-rendering: crispEdges;
}

:deep(.gridlines path.domain) {
  display: none;
}

:deep(.axis path.domain) {
  stroke: #c3c2b7;
}

:deep(.axis line) {
  stroke: #e1e0d9;
}

:deep(.axis text) {
  fill: #898781;
  font-size: 11px;
}

:deep(.y-axis path.domain) {
  display: none;
}

:deep(path.area) {
  fill: v-bind(LINE_COLOR);
  fill-opacity: 0.1;
  stroke: none;
}

:deep(path.line) {
  fill: none;
  stroke: v-bind(LINE_COLOR);
  stroke-width: 2px;
  stroke-linejoin: round;
  stroke-linecap: round;
}

:deep(.hit-point) {
  fill: transparent;
  pointer-events: none;
  outline: none;
}

:deep(rect.overlay) {
  fill: transparent;
  cursor: crosshair;
}

:deep(.crosshair) {
  pointer-events: none;
}

:deep(.crosshair-line) {
  stroke: #52514e;
  stroke-width: 1px;
}

:deep(.crosshair-dot) {
  fill: v-bind(LINE_COLOR);
  stroke: #ffffff;
  stroke-width: 2px;
}

:deep(.tooltip-bg) {
  fill: #1c1c1a;
  opacity: 0.92;
}

:deep(.tooltip-label),
:deep(.tooltip-value) {
  fill: #ffffff;
  font-size: 11px;
}

:deep(.tooltip-value) {
  font-weight: 600;
}
</style>
