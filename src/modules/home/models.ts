import { z } from 'zod'

export const HomeSectionItemModel = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    type: z.string().optional(),
    image: z.string().optional(),
    url: z.string().optional()
  })
  .openapi('HomeSectionItem')

export const HomeSectionModel = z
  .object({
    id: z.string().openapi({ description: 'Raw module key from JioSaavn, e.g. "new_trending"' }),
    title: z.string(),
    subtitle: z.string().optional(),
    type: z.string().optional().openapi({ description: 'e.g. album, playlist, radio_station, mix, song, artist' }),
    position: z.number().optional(),
    items: z.array(HomeSectionItemModel)
  })
  .openapi('HomeSection')

export const HomeModel = z
  .object({
    sections: z.array(HomeSectionModel)
  })
  .openapi('Home')

// Loose shape of the raw content.getBrowseModules response. JioSaavn's own
// module keys/fields aren't documented and vary by account/region, so this
// stays permissive rather than risking a validation failure on real data.
export const HomeAPIResponseModel = z.record(
  z.string(),
  z
    .object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
      type: z.string().optional(),
      position: z.number().optional(),
      data: z.array(z.record(z.string(), z.unknown())).optional()
    })
    .passthrough()
    .optional()
)