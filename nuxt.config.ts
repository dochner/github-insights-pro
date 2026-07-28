import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-27',
  devtools: { enabled: true },

  app: {
    head: {
      title: 'GitHub Insights Pro',
      htmlAttrs: { lang: 'en' },
      meta: [
        {
          name: 'description',
          content: 'A data-heavy analytics dashboard for the public GitHub API, with custom list virtualization, D3-driven charts, and web-worker-backed aggregation built for production performance.',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        // JetBrains Mono (numbers/hashes/timestamps) + Space Grotesk (titles/labels/prose) — the dashboard's two design-token font families.
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Space+Grotesk:wght@400;500;700&display=swap',
        },
      ],
    },
  },

  modules: ['@pinia/nuxt'],

  typescript: {
    strict: true,
    typeCheck: true,
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Server-only — used by the proxy in server/api/github
    githubToken: '',
    public: {},
  },

  nitro: {
    // Pre-gzip built static assets; the node-server preset serves them uncompressed otherwise.
    compressPublicAssets: true,
    routeRules: {
      '/api/github/**': { cors: true },
    },
  },

  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
})
