# GitHub Insights Pro

A data-heavy analytics dashboard built on top of the public GitHub API, designed to
prove production-grade frontend engineering — not just "fetch an API and show some
cards." The focus is full control over the parts that typically break in
data-heavy dashboards: list rendering, data visualization, main-thread cost, and
SSR hydration.

> Project 1 of a 5-project portfolio series aimed at demonstrating top-3%
> frontend engineering competence. Full technical context and conventions in
> [`CLAUDE.md`](./CLAUDE.md).

## Technical challenges

Each item below is implemented without reaching for a library that would solve
the problem "for free" — the goal is to expose the engineering behind it:

| Challenge | Approach |
|---|---|
| Lists with thousands of items (commits/contributors) | Custom virtualization (`useVirtualList`), no `vue-virtual-scroller` or similar |
| Heavy statistical aggregations | Dedicated Web Worker (`analytics.worker.ts`) to keep computation off the main thread, with graceful fallback when `Worker` isn't available |
| Data visualization | D3.js manipulating SVG directly (`ActivityHeatmap`, `CommitTimeline`) — no `recharts`, `chart.js`, or chart wrappers |
| SSR without layout shift | Incremental hydration via Nuxt 4, chart components loaded through `defineAsyncComponent` |
| GitHub API rate limiting | Server-side proxy (`server/api/github`) that hides the token from the client, backed by a Pinia cache with TTL and selective invalidation |
| Bundle size | Aggressive per-chart code-splitting, measured via Lighthouse CI |

## Architecture

```
app/
├── components/
│   ├── charts/          # ActivityHeatmap, CommitTimeline — plain D3 over SVG
│   ├── dashboard/         # VirtualizedList and other dashboard primitives
│   └── ui/                 # shadcn-vue (reka-ui) primitives
├── composables/
│   ├── useGithubApi.ts     # typed fetch wrapper over the server-side proxy
│   ├── useVirtualList.ts   # custom virtualization (visible window + buffer)
│   ├── useChartWorker.ts   # communication with the analytics web worker
│   ├── useChartResize.ts   # chart responsiveness via ResizeObserver
│   └── useBreakpoint.ts
├── stores/                  # Pinia — data orchestration and caching
├── workers/
│   └── analytics.worker.ts  # aggregations off the main thread
└── server/api/github/       # proxy — GitHub API auth and rate limiting
```

State management follows a simple rule: **composables** for UI state and local
logic (e.g. breakpoint, chart resize); **Pinia** for heavy business logic and
global state shared across components (data normalization, caching, filters).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Nuxt 4 (SSR/edge-ready) | Incremental hydration and server-side API routing in the same project |
| Language | TypeScript, strict mode | Full typing across the GitHub API surface and stores |
| Components | `<script setup>` | Project standard, block order `script` → `template` → `style` |
| State | Pinia + Composables | Explicit separation between UI state and business logic |
| Styling | Tailwind CSS v4 | Scoped CSS/PostCSS only when strictly necessary |
| UI | shadcn-vue (reka-ui) | Accessible components without a heavyweight design system |
| Charts | D3.js over SVG | Full control of scale/transition/render — no chart library |
| Testing | Vitest | Coverage for critical composables (e.g. `useVirtualList`) |

## Setup

```bash
pnpm install
pnpm dev
```

Other available scripts: `pnpm test`, `pnpm test:watch`, `pnpm typecheck`,
`pnpm build`, `pnpm generate`.

## Performance metrics

**Lighthouse (CI, `ubuntu-latest`, 3 runs, median):** [full report](https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/1785210061849-75805.report.html)

| Category | Score |
|---|---|
| Performance | 100 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

**Core Web Vitals** (from the same run):

| Metric | Value |
|---|---|
| LCP (Largest Contentful Paint) | 1.5 s |
| CLS (Cumulative Layout Shift) | 0 |
| TBT (Total Blocking Time) | 20 ms |
| FCP (First Contentful Paint) | 1.5 s |

Two audits are intentionally at `warn`, not `error`, per `.lighthouserc.cjs`
(the page hits the live GitHub API, so network variance is expected on a
first CI pass): `render-blocking-resources` (0.5) and `unused-javascript`
(0). Neither blocks the CI check.

**Bundle size per route** (real `.output/public/_nuxt/` output from a local
`pnpm build`, raw / gzip):

| Route | Shared entry chunk | Route chunk | Route CSS | Async chart chunk |
|---|---|---|---|---|
| `/` | 195.0 KB / 71.1 KB | 5.4 KB / 2.2 KB | 8.2 KB / 2.5 KB | `ActivityHeatmap` (+ D3): 58.9 KB / 20.0 KB, loaded on demand via `defineAsyncComponent` |
| `/404` (error) | 195.0 KB / 71.1 KB (shared) | 3.6 KB / 1.6 KB | 2.4 KB / 0.8 KB | — |
| `/500` (error) | 195.0 KB / 71.1 KB (shared) | 3.3 KB / 1.5 KB | 1.9 KB / 0.7 KB | — |

The shared entry chunk (Vue runtime, Pinia, app bootstrap) is fetched once
and cached by the browser across routes. The D3-dependent `ActivityHeatmap`
chunk is not part of the initial `/` payload — it's fetched only once the
async component starts loading, per the `defineAsyncComponent` split
described above.

**Methodology:** Lighthouse numbers are from the real, published CI run
above, executed by the `lighthouse.yml` GitHub Actions workflow on
[PR #18](https://github.com/dochner/github-insights-pro/pull/18) against
commit `a8b1014`. Bundle sizes were measured locally from a fresh `pnpm
build` against the same commit, reading actual file sizes in
`.output/public/_nuxt/` (`.output` is not committed — rebuild locally to
reproduce). Both are snapshots as of this PR (2026-07-28); rerun
`pnpm build` and check the `lighthouse.yml` workflow runs for current
numbers rather than treating these as permanently up to date.

## Status

All planned milestones (`SCRUM-2` through `SCRUM-20`) are complete: setup,
API proxy, Pinia stores with TTL cache, custom list virtualization, the
D3 heatmap and commit timeline, the analytics web worker, chart
code-splitting, and the Lighthouse CI / accessibility audit are all done.

Known rough edges: `CommitTimeline` and `VirtualizedList` are implemented
and covered by tests (including axe a11y specs) but are not yet wired into
`app/pages/index.vue` or any other page — the dashboard currently renders
only the `ActivityHeatmap`. `render-blocking-resources` and
`unused-javascript` remain at Lighthouse `warn` rather than fully resolved,
which is the deliberate, documented first-CI-pass posture in
`.lighthouserc.cjs`, not an oversight.
