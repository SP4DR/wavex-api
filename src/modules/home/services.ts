import { GetHomeUseCase, type GetHomeArgs } from '#modules/home/use-cases'

export class HomeService {
  private readonly getHomeUseCase: GetHomeUseCase

  constructor() {
    this.getHomeUseCase = new GetHomeUseCase()
  }

  getHome = (args: GetHomeArgs) => {
    return this.getHomeUseCase.execute(args)
  }
}
