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
