import {
  AlbumController,
  ArtistController,
  HomeController,
  SearchController,
  SongController,
  ProfileController,
  LikedTrackController
} from '#modules/index'
import { PlaylistController } from '#modules/playlists/controllers'
import { App } from './app'

const app = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController(),
  new HomeController(),
  new ProfileController(),
  new LikedTrackController()
]).getApp()

export default app

