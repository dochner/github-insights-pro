// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-27',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

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
    routeRules: {
      '/api/github/**': { cors: true },
    },
  },
})
