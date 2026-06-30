// Post-export OG/social-card injector (B 2026-06-28). Expo web (metro, output:single) generates a
// bare dist/index.html with no social meta, so a shared voidtv.net link previews as a naked URL.
// Social crawlers read STATIC html and don't run JS, so runtime injection can't work - we patch the
// exported html instead. Run from the Vercel buildCommand AFTER `expo export` (see vercel.json).
// Idempotent. Swap OG_IMAGE for a real 1200x630 banner (and twitter:card -> summary_large_image) later.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'dist', 'index.html');
const TAGLINE = 'before AI slop, there was human creativity';
const TITLE = 'VOIDtv · ' + TAGLINE; // middot, no em dash
const DESC = 'A window into human-made media from the Internet Archive: movies, shows, anime, documentaries, and the strange and forgotten. No algorithm.';
const OG_IMAGE = 'https://www.voidtv.net/icon-512.png'; // square for now; replace with a 1200x630 banner
const SITE = 'https://www.voidtv.net';

try {
  let html = fs.readFileSync(FILE, 'utf8');
  if (html.includes('og:title')) { console.log('[og] meta already present, skipping'); process.exit(0); }
  const meta = [
    '<meta name="description" content="' + DESC + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="VOIDtv">',
    '<meta property="og:title" content="' + TITLE + '">',
    '<meta property="og:description" content="' + DESC + '">',
    '<meta property="og:image" content="' + OG_IMAGE + '">',
    '<meta property="og:url" content="' + SITE + '">',
    '<meta name="twitter:card" content="summary">',
    '<meta name="twitter:title" content="' + TITLE + '">',
    '<meta name="twitter:description" content="' + DESC + '">',
    '<meta name="twitter:image" content="' + OG_IMAGE + '">',
  ].join('');
  html = html.replace('</head>', meta + '</head>');
  fs.writeFileSync(FILE, html);
  console.log('[og] injected social meta into dist/index.html');
} catch (e) {
  // Never fail the build over the card; the app still works without it.
  console.error('[og] inject skipped:', e.message);
  process.exit(0);
}
