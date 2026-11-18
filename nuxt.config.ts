// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/hints', '@nuxt/ui', '@nuxtjs/better-auth'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2025-07-15',
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
