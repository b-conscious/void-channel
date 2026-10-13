// Watch page: a single HTML file built from catalog/shows/*.json so B can watch what the
// builder has found so far. Shows -> seasons -> episodes -> plays straight from archive.org.
// Not the site; a first taste of it. Usage: node scripts/preview.js  -> catalog/preview.html
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOWS_DIR = path.join(ROOT, 'catalog', 'shows');
const OUT = path.join(ROOT, 'catalog', 'preview.html');

const ART_FILE = path.join(ROOT, 'catalog', 'art.json');
const ART = fs.existsSync(ART_FILE) ? JSON.parse(fs.readFileSync(ART_FILE, 'utf8')) : {};

const shows = fs.readdirSync(SHOWS_DIR).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8')))
  .filter((s) => s.seasons)
  .map((s) => ({
    show: s.show, slug: s.slug, type: s.type, network: s.network, year: (s.tvmaze.premiered || '').slice(0, 4), runtime: s.tvmaze.runtime,
    poster: (ART[s.slug] || {}).poster || null, backdrop: (ART[s.slug] || {}).backdrop || null,
    overview: (ART[s.slug] || {}).overview || '', genres: (ART[s.slug] || {}).genres || [], rating: (ART[s.slug] || {}).rating || null,
    seasons: s.seasons.map((se) => ({
      season: se.season,
      // Only files a browser can actually play; silent or black ones stay in the review queue.
      episodes: se.episodes.filter((e) => e.file && e.file.playable).map((e) => ({ n: e.number, name: e.name, state: e.state, url: e.file.url, min: Math.round(e.file.seconds / 60), item: e.file.item })),
    })).filter((se) => se.episodes.length),
  }))
  .filter((s) => s.seasons.length)
  .sort((a, b) => b.seasons.reduce((n, se) => n + se.episodes.length, 0) - a.seasons.reduce((n, se) => n + se.episodes.length, 0));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VOIDtv preview</title>
<style>
:root{--bg:#07080c;--panel:#0f1118;--line:#1d2130;--fg:#e8e8ee;--dim:#8a8fa3;--acc:#5fd4ff;--rev:#f3c969}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
header{display:flex;align-items:baseline;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
header b{font-size:22px;letter-spacing:.04em}header span{color:var(--dim)}
main{display:grid;grid-template-columns:300px 1fr;min-height:calc(100vh - 54px)}
nav{border-right:1px solid var(--line);overflow:auto;max-height:calc(100vh - 54px)}
nav button{display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);color:var(--fg);padding:8px 12px;cursor:pointer;font:inherit}
nav button:hover,nav button.on{background:var(--panel)}nav small{display:block;color:var(--dim)}
nav img,nav .ph{width:44px;height:66px;object-fit:cover;border-radius:4px;background:var(--panel);flex:none}
.hero{position:relative;border-radius:8px;overflow:hidden;margin-bottom:12px;background:var(--panel)}
.hero img{width:100%;max-height:220px;object-fit:cover;display:block;opacity:.55}
.hero .t{position:absolute;left:18px;bottom:14px;right:18px}.hero .t b{font-size:26px}.hero .t p{margin:6px 0 0;color:var(--fg);max-width:720px;font-size:14px}
.hero .g{color:var(--dim);font-size:12px;margin-top:4px}
section{padding:16px 20px;overflow:auto;max-height:calc(100vh - 54px)}
video{width:100%;max-height:62vh;background:#000;border-radius:6px;outline:none}
.now{display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px}.now b{font-size:18px}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 14px;border-radius:6px;cursor:pointer;font:inherit}
h3{margin:18px 0 6px;color:var(--dim);font-weight:600;letter-spacing:.06em;font-size:12px}
.ep{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:6px;cursor:pointer}.ep:hover,.ep.on{background:var(--panel)}
.ep .n{color:var(--dim);width:36px}.ep .m{color:var(--dim);margin-left:auto}.ep .r{color:var(--rev);font-size:11px;border:1px solid var(--rev);border-radius:4px;padding:0 5px}
.hint{color:var(--dim);font-size:13px;margin-top:14px}
@media(max-width:800px){main{grid-template-columns:1fr}nav{max-height:200px}}
</style></head><body>
<header><b>VOID<span style="color:var(--acc)">tv</span></b><span>preview: what the builder has found so far</span></header>
<main><nav id="nav"></nav><section id="sec"></section></main>
<script>
const SHOWS=${JSON.stringify(shows)};
let cur={s:0,se:0,e:0};
const $=(id)=>document.getElementById(id);
function nav(){$('nav').innerHTML=SHOWS.map((s,i)=>{const n=s.seasons.reduce((a,se)=>a+se.episodes.length,0);return '<button class="'+(i===cur.s?'on':'')+'" onclick="pick('+i+')">'+(s.poster?'<img loading="lazy" src="'+s.poster+'" alt="">':'<span class="ph"></span>')+'<span>'+s.show+'<small>'+s.network+' · '+s.year+' · '+n+' episodes</small></span></button>'}).join('')}
function hero(s){if(!s.backdrop&&!s.overview)return '';return '<div class="hero">'+(s.backdrop?'<img src="'+s.backdrop+'" alt="">':'')+'<div class="t"><b>'+s.show+'</b>'+(s.overview?'<p>'+s.overview.slice(0,220)+(s.overview.length>220?'…':'')+'</p>':'')+'<div class="g">'+[s.genres.join(' · '),s.rating?'★ '+s.rating:''].filter(Boolean).join('  ·  ')+'</div></div></div>'}
function pick(i){cur={s:i,se:0,e:0};render(true)}
function play(se,e){cur.se=se;cur.e=e;render(true)}
function next(){const s=SHOWS[cur.s];if(cur.e+1<s.seasons[cur.se].episodes.length)play(cur.se,cur.e+1);else if(cur.se+1<s.seasons.length)play(cur.se+1,0)}
function render(autoplay){nav();const s=SHOWS[cur.s];const ep=s.seasons[cur.se].episodes[cur.e];
$('sec').innerHTML=(autoplay?'':hero(s))+'<video id="v" controls '+(autoplay?'autoplay':'')+' src="'+ep.url+'"></video>'
+'<div class="now"><div><b>'+s.show+'</b> &nbsp; S'+String(s.seasons[cur.se].season).padStart(2,'0')+'E'+String(ep.n).padStart(2,'0')+' · '+ep.name+(ep.state==='REVIEW'?' <span class="r">review</span>':'')+'</div><button class="btn" onclick="next()">Next episode ▶</button></div>'
+s.seasons.map((se,si)=>'<h3>SEASON '+se.season+'</h3>'+se.episodes.map((x,ei)=>'<div class="ep '+(si===cur.se&&ei===cur.e?'on':'')+'" onclick="play('+si+','+ei+')"><span class="n">E'+x.n+'</span><span>'+x.name+'</span>'+(x.state==='REVIEW'?'<span class="r">review</span>':'')+'<span class="m">'+x.min+' min</span></div>').join('')).join('')
+'<p class="hint">Video streams straight from archive.org. Space / K play-pause, N next episode, F fullscreen. "review" = the builder is not sure this file is this episode.</p>';
const v=$('v');v.onended=next;v.onerror=()=>{v.insertAdjacentHTML('afterend','<p style="color:#f66">This file would not play in the browser (codec or missing). Next episode in 3s…</p>');setTimeout(next,3000)};}
document.addEventListener('keydown',(k)=>{const v=$('v');if(!v||k.target.tagName==='INPUT')return;if(k.key===' '||k.key==='k'){k.preventDefault();v.paused?v.play():v.pause()}if(k.key==='n')next();if(k.key==='f')v.requestFullscreen&&v.requestFullscreen();if(k.key==='ArrowRight')v.currentTime+=10;if(k.key==='ArrowLeft')v.currentTime-=10});
render(false);
</script></body></html>`;
fs.writeFileSync(OUT, html);
console.log(`${shows.length} shows, ${shows.reduce((n, s) => n + s.seasons.reduce((a, se) => a + se.episodes.length, 0), 0)} episodes -> ${path.relative(ROOT, OUT)}`);
