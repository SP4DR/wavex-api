import { AlbumController, ArtistController, HomeController, SearchController, SongController } from '#modules/index'
import { PlaylistController } from '#modules/playlists/controllers'
import { ProfileController } from '#modules/profiles/controllers'
import { App } from './app'

const app = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController(),
  new HomeController(),
  new ProfileController()
]).getApp()

export default app
