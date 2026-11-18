
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getDatabase } from '#common/database/client'
import type { Routes } from '#common/types'

const ProfileParams = z.object({
  deviceId: z.string().uuid()
})

const ArtistBody = z.object({
  provider: z.string().trim().min(1).max(40),
  providerArtistId: z.string().trim().min(1).max(255),
  artistName: z.string().trim().min(1),
  artworkUrl: z.string().url().nullable().optional()
})

export class FollowedArtistController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()

    this.controller.use('*', async (ctx, next) => {
      await next()
      ctx.header('Cache-Control', 'no-store')
    })
  }

  public initRoutes() {
    // Follow an artist
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/profiles/{deviceId}/followed-artists',
        tags: ['Followed Artists'],
        summary: 'Follow an artist for a profile',
        request: {
          params: ProfileParams,
          body: {
            required: true,
            content: {
              'application/json': {
                schema: ArtistBody
              }
            }
          }
        },
        responses: {
          200: { description: 'Artist followed or already followed' },
          404: { description: 'Profile not found' },
          500: { description: 'Unable to follow artist' }
        }
      }),
      async (ctx) => {
        const { deviceId } = ctx.req.valid('param')
        const body = ctx.req.valid('json')

        try {
          const sql = getDatabase(ctx)

          const rows = await sql`
            WITH profile AS (
              SELECT id
              FROM profiles
              WHERE device_id = ${deviceId}
            ),
            followed AS (
              INSERT INTO followed_artists (
                profile_id,
                provider,
                provider_artist_id,
                artist_name,
                artwork_url
              )
              SELECT
                profile.id,
                ${body.provider},
                ${body.providerArtistId},
                ${body.artistName},
                ${body.artworkUrl ?? null}
              FROM profile
              ON CONFLICT (
                profile_id,
                provider,
                provider_artist_id
              )
              DO NOTHING
              RETURNING
                id,
                provider,
                provider_artist_id,
                artist_name,
                artwork_url,
                created_at
            )
            SELECT
              COALESCE(followed.id, existing.id) AS id,
              COALESCE(followed.provider, existing.provider) AS provider,
              COALESCE(
                followed.provider_artist_id,
                existing.provider_artist_id
              ) AS provider_artist_id,
              COALESCE(
                followed.artist_name,
                existing.artist_name
              ) AS artist_name,
              COALESCE(
                followed.artwork_url,
                existing.artwork_url
              ) AS artwork_url,
              COALESCE(
                followed.created_at,
                existing.created_at
              ) AS followed_at,
              (followed.id IS NOT NULL) AS newly_followed
            FROM profile
            LEFT JOIN followed ON TRUE
            LEFT JOIN followed_artists AS existing
              ON existing.profile_id = profile.id
              AND existing.provider = ${body.provider}
              AND existing.provider_artist_id = ${body.providerArtistId}
          `

          if (rows.length === 0 || rows[0].id === null) {
            return ctx.json({
              success: false,
              message: 'Profile not found'
            }, 404)
          }

          return ctx.json({
            success: true,
            data: rows[0]
          }, 200)
        } catch {
          return ctx.json({
            success: false,
            message: 'Unable to follow artist'
          }, 500)
        }
      }
    )

    // Retrieve followed artists
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/profiles/{deviceId}/followed-artists',
        tags: ['Followed Artists'],
        summary: 'Retrieve followed artists for a profile',
        request: {
          params: ProfileParams,
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
            offset: z.coerce.number().int().min(0).default(0)
          })
        },
        responses: {
          200: { description: 'Followed artists retrieved successfully' },
          404: { description: 'Profile not found' },
          500: { description: 'Unable to retrieve followed artists' }
        }
      }),
      async (ctx) => {
        const { deviceId } = ctx.req.valid('param')
        const { limit, offset } = ctx.req.valid('query')

        try {
          const sql = getDatabase(ctx)

          const profiles = await sql`
            SELECT id
            FROM profiles
            WHERE device_id = ${deviceId}
            LIMIT 1
          `

          if (profiles.length === 0) {
            return ctx.json({
              success: false,
              message: 'Profile not found'
            }, 404)
          }

          const rows = await sql`
            SELECT
              id,
              provider,
              provider_artist_id,
              artist_name,
              artwork_url,
              created_at AS followed_at
            FROM followed_artists
            WHERE profile_id = ${profiles[0].id}
            ORDER BY created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `

          return ctx.json({
            success: true,
            data: rows,
            pagination: {
              limit,
              offset,
              count: rows.length
            }
          }, 200)
        } catch {
          return ctx.json({
            success: false,
            message: 'Unable to retrieve followed artists'
          }, 500)
        }
      }
    )

    // Unfollow an artist
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/profiles/{deviceId}/followed-artists/{provider}/{providerArtistId}',
        tags: ['Followed Artists'],
        summary: 'Unfollow an artist',
        request: {
          params: ProfileParams.extend({
            provider: z.string().min(1).max(40),
            providerArtistId: z.string().min(1).max(255)
          })
        },
        responses: {
          200: { description: 'Artist unfollowed successfully' },
          404: { description: 'Followed artist not found' },
          500: { description: 'Unable to unfollow artist' }
        }
      }),
      async (ctx) => {
        const {
          deviceId,
          provider,
          providerArtistId
        } = ctx.req.valid('param')

        try {
          const sql = getDatabase(ctx)

          const rows = await sql`
            DELETE FROM followed_artists AS followed
            USING profiles AS profile
            WHERE profile.device_id = ${deviceId}
              AND followed.profile_id = profile.id
              AND followed.provider = ${provider}
              AND followed.provider_artist_id = ${providerArtistId}
            RETURNING followed.id
          `

          if (rows.length === 0) {
            return ctx.json({
              success: false,
              message: 'Followed artist not found'
            }, 404)
          }

          return ctx.json({
            success: true,
            message: 'Artist unfollowed successfully'
          }, 200)
        } catch {
          return ctx.json({
            success: false,
            message: 'Unable to unfollow artist'
          }, 500)
        }
      }
    )
  }
}
