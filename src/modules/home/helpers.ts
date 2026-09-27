import type { HomeAPIResponseModel, HomeModel } from '#modules/home/models'
import type { z } from 'zod'

// content.getBrowseModules items are inconsistent about where the image
// lives: song/album-shaped items give an array of { quality, url }, while
// browse-module items often give a single string URL at 150x150. Handle both.
const resolveImage = (image: unknown): string | undefined => {
  if (Array.isArray(image) && image.length > 0) {
    const last = image[image.length - 1] as { url?: string; link?: string }
    return last?.url || last?.link
  }
  if (typeof image === 'string' && image.length > 0) {
    return image.replace(/50x50|150x150/g, '500x500')
  }
  return undefined
}

const pickString = (obj: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

type RawModule = NonNullable<z.infer<typeof HomeAPIResponseModel>[string]>

export const createHomePayload = (raw: z.infer<typeof HomeAPIResponseModel>): z.infer<typeof HomeModel> => {
  const sections = Object.entries(raw)
    .filter((entry): entry is [string, RawModule] => {
      const value = entry[1]
      return !!value && Array.isArray(value.data) && value.data.length > 0
    })
    .map(([id, module]) => ({
      id,
      title: module.title || id,
      subtitle: module.subtitle,
      type: module.type,
      position: module.position,
      items: (module.data ?? []).map((item) => ({
        id: pickString(item, 'id', 'listid', 'token'),
        title: pickString(item, 'title', 'name'),
        // `more_info` on real JioSaavn items is usually a nested object
        // (singers, music, etc.), not a string — pickString safely skips it
        // rather than crashing; refine this once you see a real payload.
        subtitle: pickString(item, 'subtitle', 'singers'),
        type: pickString(item, 'type'),
        image: resolveImage(item.image),
        url: pickString(item, 'perma_url', 'url')
      }))
    }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return { sections }
}
