import { betterAuth } from 'better-auth'
import serverAuth from './server/auth.config'

export const auth = betterAuth(serverAuth({ runtimeConfig: {}, db: null }))
