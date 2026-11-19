
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getDatabase } from '#common/database/client'
import type { Routes } from '#common/types'

const EventTypes = [
  'play_started',
  'play_completed',
  'skip',
  'replay'
] as const

const ProfileParams = z.object({
  deviceId: z.string().uuid()
})

const ListeningEventBody = z.object({
  provider: z.string().trim().min(1).max(40),
  providerTrackId: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1),
  artistName: z.string().nullable().optional(),
  albumName: z.string().nullable().optional(),
  artworkUrl: z.string().url().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  language: z.string().max(40).nullable().optional(),
  isExplicit: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  eventType: z.enum(EventTypes),
  playedMs: z.number().int().nonnegative().optional(),
  completionPercent: z.number().min(0).max(100).nullable().optional(),
  source: z.string().trim().min(1).max(32).optional()
})

export class ListeningEventController implements Routes {
  public controller: OpenAPIHono

  constructor() {
    this.controller = new OpenAPIHono()

    this.controller.use('*', async (ctx, next) => {
      await next()
      ctx.header('Cache-Control', 'no-store')
    })
  }

  public initRoutes() {
    // Record a listening event
    this.controller.openapi(
      createRoute({
        method: 'post',
        path: '/profiles/{deviceId}/listening-events',
        tags: ['Listening Events'],
        summary: 'Record a listening event for a profile',
        request: {
          params: ProfileParams,
          body: {
            required: true,
            content: {
              'application/json': {
                schema: ListeningEventBody
              }
            }
          }
        },
        responses: {
          200: { description: 'Listening event recorded successfully' },
          404: { description: 'Profile not found' },
          500: { description: 'Unable to record listening event' }
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
            recorded_event AS (
              INSERT INTO listening_events (
                profile_id,
                track_id,
                event_type,
                played_ms,
                completion_percent,
                source
              )
              SELECT
                profile.id,
                upserted_track.id,
                ${body.eventType},
                ${body.playedMs ?? 0},
                ${body.completionPercent ?? null},
                ${body.source ?? 'unknown'}
              FROM profile
              CROSS JOIN upserted_track
              RETURNING
                id,
                profile_id,
                track_id,
                event_type,
                played_ms,
                completion_percent,
                source,
                occurred_at
            )
            SELECT
              recorded_event.id,
              recorded_event.event_type,
              recorded_event.played_ms,
              recorded_event.completion_percent,
              recorded_event.source,
              recorded_event.occurred_at,
              upserted_track.id AS track_id,
              upserted_track.provider,
              upserted_track.provider_track_id,
              upserted_track.title,
              upserted_track.artist_name,
              upserted_track.album_name,
              upserted_track.artwork_url,
              upserted_track.duration_seconds,
              upserted_track.language,
              upserted_track.is_explicit
            FROM recorded_event
            INNER JOIN upserted_track
              ON upserted_track.id = recorded_event.track_id
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
            message: 'Unable to record listening event'
          }, 500)
        }
      }
    )

    // Retrieve listening history
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/profiles/{deviceId}/listening-events',
        tags: ['Listening Events'],
        summary: 'Retrieve listening events for a profile',
        request: {
          params: ProfileParams,
          query: z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
            offset: z.coerce.number().int().min(0).default(0)
          })
        },
        responses: {
          200: { description: 'Listening events retrieved successfully' },
          404: { description: 'Profile not found' },
          500: { description: 'Unable to retrieve listening events' }
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
              events.id,
              events.event_type,
              events.played_ms,
              events.completion_percent,
              events.source,
              events.occurred_at,
              tracks.id AS track_id,
              tracks.provider,
              tracks.provider_track_id,
              tracks.title,
              tracks.artist_name,
              tracks.album_name,
              tracks.artwork_url,
              tracks.duration_seconds,
              tracks.language,
              tracks.is_explicit
            FROM listening_events AS events
            INNER JOIN tracks
              ON tracks.id = events.track_id
            WHERE events.profile_id = ${profiles[0].id}
            ORDER BY events.occurred_at DESC, events.id DESC
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
            message: 'Unable to retrieve listening events'
          }, 500)
        }
      }
    )
  }
}
