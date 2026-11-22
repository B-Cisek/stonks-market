import { defineServerAuth } from '@nuxtjs/better-auth/config'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { db } from './db'
import * as schema from './db/schema'

export default defineServerAuth(() => ({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  advanced: {
    database: {
      joins: true,
    },
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip'],
    },
  },
  socialProviders: {
    kick: {
      clientId: process.env.KICK_CLIENT_ID as string,
      clientSecret: process.env.KICK_CLIENT_SECRET as string,
    },
  },
}))
