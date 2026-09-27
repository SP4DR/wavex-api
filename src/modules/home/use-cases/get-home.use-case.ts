import { Endpoints } from '#common/constants'
import { useFetch } from '#common/helpers'
import { createHomePayload } from '#modules/home/helpers'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types'
import type { HomeAPIResponseModel, HomeModel } from '#modules/home/models'
import type { z } from 'zod'

export interface GetHomeArgs {
  language?: string
}

export class GetHomeUseCase implements IUseCase<GetHomeArgs, z.infer<typeof HomeModel>> {
  async execute({ language }: GetHomeArgs): Promise<z.infer<typeof HomeModel>> {
    const { data } = await useFetch<z.infer<typeof HomeAPIResponseModel>>({
      endpoint: Endpoints.modules,
      params: language ? { language } : {}
    })

    if (!data) throw new HTTPException(404, { message: 'no home data found' })

    return createHomePayload(data)
  }
}
