import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getDatabase } from '#common/database/client'
import type { Routes } from '#common/types'

const TrackBody = z.object({
  provider: z.string().trim().min(1).max(40),
  providerTrackId: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1),
  artistName: z.string().nullable().optional(),
  albumName: z.string().nullable().optional(),
  artworkUrl: z.string().url().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  language: z.string().max(40).nullable().optional(),
  isExplicit: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

const ProfileParams = z.object({
  deviceId: z.string().uuid()
})

export class LikedTrackController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()

    this.controller.use('*', async (ctx, next) => {
      await next()
      ctx.header('Cache-Control', 'no-store')
    })
  }

  public initRoutes() {
    // Like a track
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/profiles/{deviceId}/liked-tracks',
        tags: ['Liked Tracks'],
        summary: 'Like a track for a profile',
        request: {
          params: ProfileParams,
          body: {
            required: true,
            content: {
              'application/json': {
                schema: TrackBody
              }
            }
          }
        },
        responses: {
          200: { description: 'Track liked or already liked' },
          404: { description: 'Profile not found' },
          500: { description: 'Unable to like track' }
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
            upserted_track AS (
              INSERT INTO tracks (
                provider,
                provider_track_id,
                title,
                artist_name,
                album_name,
                artwork_url,
                duration_seconds,
                language,
                is_explicit,
                metadata
              )
              SELECT
                ${body.provider},
                ${body.providerTrackId},
                ${body.title},
                ${body.artistName ?? null},
                ${body.albumName ?? null},
                ${body.artworkUrl ?? null},
                ${body.durationSeconds ?? null},
                ${body.language ?? null},
                ${body.isExplicit ?? false},
                ${JSON.stringify(body.metadata ?? {})}::jsonb
              FROM profile
              ON CONFLICT (provider, provider_track_id)
              DO UPDATE SET
                title = EXCLUDED.title,
                artist_name = COALESCE(
                  EXCLUDED.artist_name, tracks.artist_name
                ),
                album_name = COALESCE(
                  EXCLUDED.album_name, tracks.album_name
                ),
                artwork_url = COALESCE(
                  EXCLUDED.artwork_url, tracks.artwork_url
                ),
                duration_seconds = COALESCE(
                  EXCLUDED.duration_seconds, tracks.duration_seconds
                ),
                language = COALESCE(
                  EXCLUDED.language, tracks.language
                ),
                is_explicit = EXCLUDED.is_explicit,
                metadata = tracks.metadata || EXCLUDED.metadata,
                updated_at = NOW()
              RETURNING
                id,
                provider,
                provider_track_id,
                title,
                artist_name,
                album_name,
                artwork_url,
                duration_seconds,
                language,
                is_explicit
            ),
            liked AS (
              INSERT INTO liked_tracks (
                profile_id,
                track_id
              )
              SELECT profile.id, upserted_track.id
              FROM profile
              CROSS JOIN upserted_track
              ON CONFLICT (profile_id, track_id)
              DO NOTHING
              RETURNING track_id, created_at
            )
            SELECT
              upserted_track.*,
              COALESCE(
                liked.created_at,
                existing_like.created_at
              ) AS liked_at,
              (liked.track_id IS NOT NULL) AS newly_liked
            FROM profile
            CROSS JOIN upserted_track
            LEFT JOIN liked
              ON liked.track_id = upserted_track.id
            LEFT JOIN liked_tracks AS existing_like
              ON existing_like.profile_id = profile.id
              AND existing_like.track_id = upserted_track.id
          `

          if (rows.length === 0) {
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
            message: 'Unable to like track'
          }, 500)
        }
      }
    )

    // Retrieve liked tracks
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/profiles/{deviceId}/liked-tracks',
        tags: ['Liked Tracks'],
        summary: 'Retrieve liked tracks for a profile',
        request: {
          params: ProfileParams,
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
            offset: z.coerce.number().int().min(0).default(0)
          })
        },
        responses: {
          200: { description: 'Liked tracks retrieved successfully' },
          404: { description: 'Profile not found' },
          500: { description: 'Unable to retrieve liked tracks' }
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
              tracks.id,
              tracks.provider,
              tracks.provider_track_id,
              tracks.title,
              tracks.artist_name,
              tracks.album_name,
              tracks.artwork_url,
              tracks.duration_seconds,
              tracks.language,
              tracks.is_explicit,
              liked_tracks.created_at AS liked_at
            FROM liked_tracks
            INNER JOIN tracks
              ON tracks.id = liked_tracks.track_id
            WHERE liked_tracks.profile_id = ${profiles[0].id}
            ORDER BY liked_tracks.created_at DESC
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
            message: 'Unable to retrieve liked tracks'
          }, 500)
        }
      }
    )

    // Unlike a track
    this.controller.openapi(
      createRoute({
        method: 'delete',
        path: '/profiles/{deviceId}/liked-tracks/{provider}/{providerTrackId}',
        tags: ['Liked Tracks'],
        summary: 'Remove a liked track',
        request: {
          params: ProfileParams.extend({
            provider: z.string().min(1).max(40),
            providerTrackId: z.string().min(1).max(255)
          })
        },
        responses: {
          200: { description: 'Track unliked successfully' },
          404: { description: 'Liked track not found' },
          500: { description: 'Unable to unlike track' }
        }
      }),
      async (ctx) => {
        const {
          deviceId,
          provider,
          providerTrackId
        } = ctx.req.valid('param')

        try {
          const sql = getDatabase(ctx)

          const rows = await sql`
            DELETE FROM liked_tracks AS liked
            USING profiles AS profile, tracks AS track
            WHERE profile.device_id = ${deviceId}
              AND liked.profile_id = profile.id
              AND track.provider = ${provider}
              AND track.provider_track_id = ${providerTrackId}
              AND liked.track_id = track.id
            RETURNING liked.track_id
          `

          if (rows.length === 0) {
            return ctx.json({
              success: false,
              message: 'Liked track not found'
            }, 404)
          }

          return ctx.json({
            success: true,
            message: 'Track unliked successfully'
          }, 200)
        } catch {
          return ctx.json({
            success: false,
            message: 'Unable to unlike track'
          }, 500)
        }
      }
    )
  }
}
