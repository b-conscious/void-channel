/**
 * VoidIcon — Bryan's hand-made neon-CRT icon set, sliced from the icon sheets into
 * transparent PNGs in mobile/assets/voidicons/. Drop-in for Ionicons where a void icon
 * exists; falls back to null (caller can keep an Ionicon as backup). Each icon carries its
 * own neon color + glow baked in, so `color` is NOT applied (unlike a glyph font) — the
 * palette is intentional. `size` sets the box; the art is contain-fit.
 *
 * Static require map (Metro needs literal paths). Add a line per sliced icon as surfaces
 * get wired. Naming: <surface>_<role> (hdr_, nav_, ply_, type_, ...).
 */
import React from 'react';
import { Image } from 'react-native';

const ICONS = {
  // Header / Top Bar
  hdr_back: require('../../assets/voidicons/hdr_back.png'),
  hdr_close: require('../../assets/voidicons/hdr_close.png'),
  hdr_hamburger: require('../../assets/voidicons/hdr_hamburger.png'),
  hdr_profile: require('../../assets/voidicons/hdr_profile.png'),
  hdr_donate: require('../../assets/voidicons/hdr_donate.png'),

  // Content types (the 18-icon sheet) — type identity on doors/cards/rows.
  type_movie: require('../../assets/voidicons/movie.png'),
  type_tv_show: require('../../assets/voidicons/tv_show.png'),
  type_short_film: require('../../assets/voidicons/short_film.png'),
  type_documentary: require('../../assets/voidicons/documentary.png'),
  type_clapperboard: require('../../assets/voidicons/clapperboard.png'),
  type_educational: require('../../assets/voidicons/educational.png'),
  type_animation: require('../../assets/voidicons/animation.png'),
  type_commercial: require('../../assets/voidicons/commercial.png'),
  type_music: require('../../assets/voidicons/music.png'),
  type_radio_drama: require('../../assets/voidicons/radio_drama.png'),
  type_podcast: require('../../assets/voidicons/podcast.png'),
  type_ebook: require('../../assets/voidicons/ebook.png'),
  type_audiobook: require('../../assets/voidicons/audiobook.png'),
  type_comic: require('../../assets/voidicons/comic.png'),
  type_magazine: require('../../assets/voidicons/magazine.png'),
  type_retro_game: require('../../assets/voidicons/retro_game.png'),
  type_arcade_game: require('../../assets/voidicons/arcade_game.png'),
};

export function hasVoidIcon(name) {
  return !!ICONS[name];
}

export default function VoidIcon({ name, size = 28, style }) {
  const src = ICONS[name];
  if (!src) return null;
  return <Image source={src} style={[{ width: size, height: size }, style]} resizeMode="contain" />;
}
