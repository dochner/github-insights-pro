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

_To be filled in at the end of the performance phase: Lighthouse score, Core
Web Vitals (LCP/CLS/INP), and bundle size per route, measured via Lighthouse CI._

## Status

Actively in development. Base setup, API proxy, stores, virtualization, web
worker, and chart components are scaffolded; real data aggregation, TTL
caching, code-splitting, and the performance/accessibility audit are still in
progress.
