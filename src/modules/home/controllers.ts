import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HomeModel } from '#modules/home/models'
import { HomeService } from '#modules/home/services'
import type { Routes } from '#common/types'

export class HomeController implements Routes {
  public controller: OpenAPIHono
  private homeService: HomeService

  constructor() {
    this.controller = new OpenAPIHono()
    this.homeService = new HomeService()
  }

  public initRoutes() {
    this.controller.openapi(
      createRoute({
        method: 'get',
        path: '/home',
        tags: ['Home'],
        summary: 'Home feed',
        description:
          'Returns the JioSaavn homepage/browse modules — trending, new releases, charts, radio stations, and more — grouped into sections. Optionally scoped by language.',
        operationId: 'getHome',
        request: {
          query: z.object({
            language: z.string().optional().openapi({
              title: 'Language',
              description: 'Comma-separated list of languages to scope the feed to',
              type: 'string',
              example: 'hindi,english'
            })
          })
        },
        responses: {
          200: {
            description: 'Successful response with the home feed',
            content: {
              'application/json': {
                schema: z.object({
                  success: z.boolean().openapi({
                    description: 'Indicates whether the request was successful',
                    type: 'boolean',
                    example: true
                  }),
                  data: HomeModel.openapi({
                    description: 'Home feed grouped into sections'
                  })
                })
              }
            }
          }
        }
      }),
      async (ctx) => {
        const { language } = ctx.req.valid('query')

        const result = await this.homeService.getHome({ language })

        return ctx.json({ success: true, data: result })
      }
    )
  }
}
