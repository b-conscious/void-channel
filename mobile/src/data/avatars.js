/**
 * Curated avatars from the Internet Archive's weirdest corners.
 * Each is a real IA item thumbnail — bizarre, vintage, and public domain.
 * Users pick one as their profile picture.
 */

const IA_THUMB = (id) => `https://archive.org/services/img/${id}?w=100`;

const AVATARS = [
  // ── Vintage oddities ──
  { id: 'popeye_spinachOverture',     label: 'Popeye',            url: IA_THUMB('popeye_spinachOverture') },
  { id: 'Betty_Boop_Snow_White',      label: 'Betty Boop',        url: IA_THUMB('Betty_Boop_Snow_White') },
  { id: 'Felix_the_Cat_Woos_Whoopee', label: 'Felix the Cat',     url: IA_THUMB('Felix_the_Cat_Woos_Whoopee') },
  { id: 'woodywoodpecker_wetblanket', label: 'Woody Woodpecker',  url: IA_THUMB('woodywoodpecker_wetblanket') },
  { id: 'NightOfTheLivingDead',       label: 'Living Dead',       url: IA_THUMB('NightOfTheLivingDead') },
  { id: 'Nosferatu_1922',             label: 'Nosferatu',         url: IA_THUMB('Nosferatu_1922') },
  { id: 'TheCabinetOfDrCaligari',     label: 'Dr. Caligari',      url: IA_THUMB('TheCabinetOfDrCaligari') },
  { id: 'plan_9_from_outer_space',    label: 'Plan 9',            url: IA_THUMB('plan_9_from_outer_space') },
  { id: 'the_little_shop_of_horrors', label: 'Little Shop',       url: IA_THUMB('the_little_shop_of_horrors') },
  { id: 'Metropolis_1927',            label: 'Metropolis',        url: IA_THUMB('Metropolis_1927') },

  // ── Sci-fi & space ──
  { id: 'voyage_dans_la_lune',        label: 'Moon Voyage',       url: IA_THUMB('voyage_dans_la_lune') },
  { id: 'TheLastManOnEarth',          label: 'Last Man',          url: IA_THUMB('TheLastManOnEarth') },
  { id: 'Atomic_Cafe',                label: 'Atomic Cafe',       url: IA_THUMB('Atomic_Cafe') },
  { id: 'duck_and_cover_1951',        label: 'Duck & Cover',      url: IA_THUMB('duck_and_cover_1951') },

  // ── Noir & mystery ──
  { id: 'DOA_1949',                   label: 'D.O.A.',            url: IA_THUMB('DOA_1949') },
  { id: 'Detour_1945',                label: 'Detour',            url: IA_THUMB('Detour_1945') },
  { id: 'Reefer_Madness_1936',        label: 'Reefer Madness',    url: IA_THUMB('Reefer_Madness_1936') },
  { id: 'carnival_of_souls',          label: 'Carnival of Souls', url: IA_THUMB('carnival_of_souls') },

  // ── Cartoons & animation ──
  { id: 'Superman_1941_Fleischer',    label: 'Superman',          url: IA_THUMB('Superman_1941_Fleischer') },
  { id: 'Gulliverstravel',            label: 'Gulliver',          url: IA_THUMB('Gulliverstravel') },
  { id: 'casper_the_friendly_ghost',  label: 'Casper',            url: IA_THUMB('casper_the_friendly_ghost') },
  { id: 'mighty_mouse_1943',          label: 'Mighty Mouse',      url: IA_THUMB('mighty_mouse_1943') },

  // ── Weird vintage ──
  { id: 'a_trip_to_the_moon_1902',    label: 'Moon Face',         url: IA_THUMB('a_trip_to_the_moon_1902') },
  { id: 'Phantom_of_the_Opera_1925',  label: 'Phantom',           url: IA_THUMB('Phantom_of_the_Opera_1925') },
  { id: 'DrJekyllMrHyde1920',         label: 'Jekyll & Hyde',     url: IA_THUMB('DrJekyllMrHyde1920') },
  { id: 'Dracula_1931',               label: 'Dracula',           url: IA_THUMB('Dracula_1931') },

  // ── Propaganda & oddities ──
  { id: 'TheCommunistThreat',         label: 'Red Scare',         url: IA_THUMB('TheCommunistThreat') },
  { id: 'design_for_dreaming_1956',   label: 'Design Dreams',     url: IA_THUMB('design_for_dreaming_1956') },
  { id: 'boop_oop_a_doop_1932',       label: 'Boop Oop',          url: IA_THUMB('boop_oop_a_doop_1932') },
  { id: 'the_three_stooges_disorder_in_the_court', label: 'Three Stooges', url: IA_THUMB('the_three_stooges_disorder_in_the_court') },

  // ── Abstract default icons ──
  { id: '_void_static',   label: 'Static',    url: null, glyph: '◈' },
  { id: '_void_signal',   label: 'Signal',    url: null, glyph: '◉' },
  { id: '_void_phantom',  label: 'Phantom',   url: null, glyph: '☠' },
  { id: '_void_star',     label: 'Star',      url: null, glyph: '★' },
  { id: '_void_diamond',  label: 'Diamond',   url: null, glyph: '◆' },
  { id: '_void_eye',      label: 'Eye',       url: null, glyph: '◎' },
];

export default AVATARS;
