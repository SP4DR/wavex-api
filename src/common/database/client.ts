
import { neon } from '@neondatabase/serverless'
import { env } from 'hono/adapter'
import type { Context } from 'hono'

type DatabaseEnv = {
  DATABASE_URL?: string
}

export const getDatabase = (c: Context) => {
  const { DATABASE_URL } = env<DatabaseEnv>(c)

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }

  return neon(DATABASE_URL)
}
