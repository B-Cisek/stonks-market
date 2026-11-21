// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/hints', '@nuxt/ui', '@nuxtjs/better-auth'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2025-07-15',
  nitro: {
    experimental: {
      tasks: true,
    },
    // cron w UTC (kontener node:24-slim): po zamknięciu sesji w USA, przed otwarciem Azji
    scheduledTasks: {
      '30 22 * * *': ['prices:sync'],
    },
  },
  auth: {
    redirects: {
      login: '/login',
      guest: '/',
      logout: '/login',
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
