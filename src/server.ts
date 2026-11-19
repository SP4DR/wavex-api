
import {
  AlbumController,
  ArtistController,
  HomeController,
  SearchController,
  SongController,
  ProfileController,
  LikedTrackController,
  FollowedArtistController,
  ListeningEventController
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
  new FollowedArtistController(),
  new ListeningEventController()
]).getApp()

export default app
