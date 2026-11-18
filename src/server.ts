import {
  AlbumController,
  ArtistController,
  HomeController,
  SearchController,
  SongController,
  ProfileController,
  LikedTrackController,
  FollowedArtistController
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
  new LikedTrackController(),
  new FollowedArtistController()
]).getApp()

export default app
