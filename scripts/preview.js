// Browse page: a single HTML file built from catalog/shows/*.json + catalog/art.json.
// Browse (filters, sort, search, genre grid) -> show (seasons, episodes) -> plays from archive.org.
// Only episodes a browser can play are listed. Usage: node scripts/preview.js -> catalog/preview.html
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOWS_DIR = path.join(ROOT, 'catalog', 'shows');
const OUT = path.join(ROOT, 'catalog', 'preview.html');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const ART_FILE = path.join(ROOT, 'catalog', 'art.json');
const ART = fs.existsSync(ART_FILE) ? JSON.parse(fs.readFileSync(ART_FILE, 'utf8')) : {};
// X-Ray and connections (scripts/people.js): per-show cast/crew, and the graph of people who link our shows.
const PEOPLE_DIR = path.join(ROOT, 'catalog', 'people');
const GRAPH_FILE = path.join(ROOT, 'catalog', 'graph.json');
const GRAPH = fs.existsSync(GRAPH_FILE) ? JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8')) : { people: {}, showLinks: {} };
const peopleFor = (slug) => { const f = path.join(PEOPLE_DIR, slug + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };

const shows = fs.readdirSync(SHOWS_DIR).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8')))
  .filter((s) => s.seasons)
  .map((s) => {
    const a = ART[s.slug] || {};
    const year = (s.tvmaze.premiered || a.year || '').slice(0, 4);
    const entry = LIST.shows.find((x) => x.name === s.show) || {};
    return {
      show: s.show, slug: s.slug, type: s.type, network: s.network, year, runtime: s.tvmaze.runtime, tags: entry.tags || [],
      poster: a.poster || null, backdrop: a.backdrop || null, overview: a.overview || '', genres: a.genres || [], rating: a.rating || null,
      country: a.country || null, matchedAt: s.matchedAt,
      seasons: s.seasons.map((se) => ({
        season: se.season,
        episodes: se.episodes.filter((e) => e.file && e.file.playable).map((e) => ({ n: e.number, name: e.name, state: e.state, url: e.file.url, min: Math.round(e.file.seconds / 60), item: e.file.item })),
      })).filter((se) => se.episodes.length),
    };
  })
  .filter((s) => s.seasons.length)
  .map((s) => ({ ...s, eps: s.seasons.reduce((n, se) => n + se.episodes.length, 0) }))
  .map((s) => {
    const p = peopleFor(s.slug);
    return { ...s, cast: p ? p.cast.slice(0, 14).map((c) => ({ id: c.id, name: c.name, photo: c.photo, as: c.character, eps: c.episodes })) : [], crew: p ? p.crew.slice(0, 6).map((c) => ({ id: c.id, name: c.name, photo: c.photo, as: c.jobs.join(', ') })) : [] };
  })
  .sort((a, b) => b.eps - a.eps);

// TV movies and specials: each is a one-episode "show" in the TV Movies row.
const MOV_DIR = path.join(ROOT, 'catalog', 'movies');
if (fs.existsSync(MOV_DIR)) {
  for (const f of fs.readdirSync(MOV_DIR)) {
    if (!f.endsWith('.json')) continue;
    const m = JSON.parse(fs.readFileSync(path.join(MOV_DIR, f), 'utf8'));
    if (!m.file || !m.file.playable || m.state === 'MISSING') continue;
    shows.push({
      show: m.title, slug: 'movie-' + m.tmdbId, type: m.kind === 'special' ? 'Specials' : 'TV Movies', network: m.kind === 'special' ? 'Special' : 'TV Movie',
      year: m.year, runtime: m.runtime, poster: m.poster, backdrop: m.backdrop, overview: m.overview, genres: [], rating: m.rating, country: null, matchedAt: m.huntedAt,
      seasons: [{ season: 1, episodes: [{ n: 1, name: m.title + (m.year ? ' (' + m.year + ')' : ''), state: m.state, url: m.file.url, min: Math.round(m.file.seconds / 60), item: m.file.item }] }],
      eps: 1, cast: [], crew: [], tags: [],
    });
  }
}

// Graph trimmed to the shows on this page: people who connect 2+ of them, and the show-to-show links.
const onPage = new Set(shows.map((s) => s.slug));
const graphPeople = {};
for (const [id, p] of Object.entries(GRAPH.people || {})) {
  const here = Object.fromEntries(Object.entries(p.shows).filter(([sl]) => onPage.has(sl)));
  if (Object.keys(here).length >= 1) graphPeople[id] = { name: p.name, photo: p.photo, shows: here };
}
const showLinks = {};
for (const [a, links] of Object.entries(GRAPH.showLinks || {})) {
  if (!onPage.has(a)) continue;
  for (const [b, ids] of Object.entries(links)) if (onPage.has(b)) (showLinks[a] = showLinks[a] || {})[b] = ids;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VOIDtv</title>
<style>
:root{--bg:#07080c;--panel:#0f1118;--panel2:#161926;--line:#1d2130;--fg:#e8e8ee;--dim:#8a8fa3;--acc:#5fd4ff;--rev:#f3c969}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
a{color:inherit;text-decoration:none}button,select,input{font:inherit}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:10px 20px;background:rgba(7,8,12,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header .logo{font-size:22px;font-weight:700;letter-spacing:.04em;cursor:pointer}header .logo span{color:var(--acc)}
header input{flex:1;max-width:420px;background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;outline:none}
header input:focus{border-color:var(--acc)}
.bar{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;align-items:center}
.bar select{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:7px 10px;border-radius:8px}
.bar .count{color:var(--dim);margin-left:auto;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 20px 8px}
.chip{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:4px 10px;border-radius:999px;font-size:13px;cursor:pointer}
.chip.on{border-color:var(--acc);color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:6px 20px 24px}
.card{cursor:pointer;border-radius:8px;overflow:hidden;background:var(--panel);outline:2px solid transparent}
.card:hover,.card:focus{outline-color:var(--acc)}
.card .p{aspect-ratio:2/3;background:var(--panel2);display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:12px;text-align:center;padding:8px}
.card img{width:100%;height:100%;object-fit:cover;display:block}
.card .t{padding:8px 10px 10px}.card b{display:block;font-size:14px;line-height:1.25}.card small{color:var(--dim);display:block;margin-top:3px}
.card .r{color:var(--rev);font-size:12px}
h2{margin:18px 20px 8px;font-size:18px;display:flex;align-items:baseline;gap:10px}h2 small{color:var(--dim);font-weight:400;font-size:13px}h2 .all{margin-left:auto;color:var(--acc);font-size:13px;font-weight:400;cursor:pointer}
.rowwrap{position:relative;padding:0 20px}
.track{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:4px 2px 10px;scrollbar-width:none}.track::-webkit-scrollbar{display:none}
.track .card{flex:0 0 156px;scroll-snap-align:start}
.arrow{position:absolute;top:0;bottom:10px;width:40px;border:0;background:linear-gradient(90deg,var(--bg),transparent);color:var(--fg);font-size:28px;cursor:pointer;z-index:2;opacity:.85}
.arrow.l{left:0}.arrow.r{right:0;background:linear-gradient(270deg,var(--bg),transparent)}.arrow:hover{opacity:1;color:var(--acc)}
.card{position:relative}.card .more{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:1px solid var(--line);background:rgba(7,8,12,.75);color:var(--fg);cursor:pointer;font-size:13px;line-height:24px;text-align:center}
.card .more:hover,.card.open .more{border-color:var(--acc);color:var(--acc)}
.detail{margin:0 20px 16px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:grid;grid-template-columns:90px 1fr;gap:14px;animation:drop .18s ease-out}
@keyframes drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.detail img{width:90px;border-radius:6px;display:block}.detail b{font-size:17px}.detail p{margin:6px 0;font-size:14px;max-width:820px}.detail .g{color:var(--dim);font-size:12px}
.detail .acts{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}
.grid .card.open .indetail{display:block}.indetail{display:none;padding:0 10px 10px;font-size:13px;color:var(--fg)}.indetail p{margin:4px 0}
.genres{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;padding:0 20px 24px}
.genres button{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:16px 10px;border-radius:10px;cursor:pointer}
.genres button:hover{border-color:var(--acc)}.genres small{display:block;color:var(--dim);margin-top:3px}
.show{padding:0 20px 24px}
.back{background:none;border:0;color:var(--acc);cursor:pointer;padding:12px 0}
.hero{position:relative;border-radius:10px;overflow:hidden;background:var(--panel);min-height:160px}
.hero img{width:100%;max-height:300px;object-fit:cover;display:block;opacity:.5}
.hero .t{position:absolute;left:20px;bottom:16px;right:20px}.hero .t b{font-size:28px}.hero .t p{margin:6px 0 0;max-width:760px;font-size:14px}.hero .g{color:var(--dim);font-size:12px;margin-top:4px}
.player{display:grid;grid-template-columns:1fr 340px;gap:16px;margin-top:14px}
video{width:100%;max-height:70vh;background:#000;border-radius:8px;outline:none}
.now{display:flex;justify-content:space-between;align-items:center;margin:10px 0 0;gap:10px}.now b{font-size:17px}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}
.eps{max-height:76vh;overflow:auto;background:var(--panel);border-radius:8px;padding:6px}
.eps h3{margin:10px 8px 4px;color:var(--dim);font-weight:600;letter-spacing:.06em;font-size:11px}
.ep{display:flex;gap:8px;align-items:center;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:14px}.ep:hover,.ep.on{background:var(--panel2)}
.ep .n{color:var(--dim);width:34px;flex:none}.ep .m{color:var(--dim);margin-left:auto;flex:none}.ep .rv{color:var(--rev);font-size:11px;border:1px solid var(--rev);border-radius:4px;padding:0 4px}
.hint{color:var(--dim);font-size:13px;margin-top:12px}
.xray h3{margin:22px 0 8px;font-size:15px;letter-spacing:.04em;color:var(--dim);font-weight:600}
.faces{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scrollbar-width:thin}
.face{flex:0 0 96px;cursor:pointer;text-align:center;border-radius:8px;padding:6px 4px;outline:2px solid transparent}.face:hover,.face.on{background:var(--panel);outline-color:var(--acc)}
.face img,.face .ph{width:72px;height:72px;border-radius:50%;object-fit:cover;background:var(--panel2);display:block;margin:0 auto 6px}
.face b{display:block;font-size:12px;line-height:1.2}.face small{display:block;color:var(--dim);font-size:11px;line-height:1.2;margin-top:2px;max-height:2.4em;overflow:hidden}
.person{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:4px 0 10px;display:grid;grid-template-columns:72px 1fr;gap:14px;animation:drop .18s ease-out}
.person img{width:72px;height:72px;border-radius:50%;object-fit:cover}.person b{font-size:16px}.person .g{color:var(--dim);font-size:12px;margin-top:2px}
.person .links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.plink{display:flex;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px 6px 6px;cursor:pointer;font-size:13px}.plink:hover{border-color:var(--acc)}
.plink img{width:28px;height:42px;object-fit:cover;border-radius:4px}.plink small{display:block;color:var(--dim);font-size:11px}
.conn{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scrollbar-width:thin}
.conn .card{flex:0 0 140px}.conn .card .via{display:block;color:var(--acc);font-size:11px;margin-top:3px;line-height:1.2}
footer{color:var(--dim);font-size:12px;padding:20px;border-top:1px solid var(--line);margin-top:20px}
@media(max-width:860px){.player{grid-template-columns:1fr}.eps{max-height:40vh}.hero .t b{font-size:22px}}
</style></head><body>
<header><div class="logo" onclick="go('')">VOID<span>tv</span></div><input id="q" placeholder="Search shows…" oninput="state.q=this.value;render()"></header>
<main id="main"></main>
<footer>Shows stream from the Internet Archive. Artwork and metadata from TMDB; this product uses the TMDB API but is not endorsed or certified by TMDB.</footer>
<script>
const SHOWS=${JSON.stringify(shows)};
const TYPES=${JSON.stringify([...LIST.types, 'TV Movies', 'Specials'])};
const PEOPLE=${JSON.stringify(graphPeople)};
const LINKS=${JSON.stringify(showLinks)};
const BY_SLUG=Object.fromEntries(SHOWS.map(s=>[s.slug,s]));
const state={q:'',type:'',genre:'',network:'',decade:'',tag:'',sort:'eps',show:null,se:0,e:0,open:null,openCtx:null,person:null};
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const decade=(y)=>y?Math.floor(+y/10)*10+'s':'';
function counts(key){const m={};for(const s of SHOWS){const v=(key==='genres'||key==='tags')?(s[key]||[]):[s[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function filtered(){const q=state.q.trim().toLowerCase();let r=SHOWS.filter(s=>(!state.type||s.type===state.type)&&(!state.genre||s.genres.includes(state.genre))&&(!state.network||s.network===state.network)&&(!state.decade||decade(s.year)===state.decade)&&(!state.tag||(s.tags||[]).includes(state.tag))&&(!q||s.show.toLowerCase().includes(q)||s.genres.join(' ').toLowerCase().includes(q)||(s.network||'').toLowerCase().includes(q)||(s.tags||[]).join(' ').toLowerCase().includes(q)));
 const by={eps:(a,b)=>b.eps-a.eps,rating:(a,b)=>(b.rating||0)-(a.rating||0)||b.eps-a.eps,year:(a,b)=>(+b.year||0)-(+a.year||0),old:(a,b)=>(+a.year||9999)-(+b.year||9999),az:(a,b)=>a.show.localeCompare(b.show),added:(a,b)=>(b.matchedAt||'').localeCompare(a.matchedAt||'')};return r.sort(by[state.sort]||by.eps)}
function sel(key,label,opts){return '<select onchange="state.'+key+'=this.value;render()"><option value="">'+label+'</option>'+opts.map(([v,n])=>'<option value="'+esc(v)+'"'+(state[key]===v?' selected':'')+'>'+esc(v)+(n?' ('+n+')':'')+'</option>').join('')+'</select>'}
function meta(s){return [s.network,s.year,s.genres.join(' · '),s.rating?'★ '+s.rating:'',s.eps+' episode'+(s.eps===1?'':'s'),s.runtime?s.runtime+' min':''].filter(Boolean).join('  ·  ')}
function card(s,ctx){const total=s.eps;const open=state.open===s.slug;return '<div class="card'+(open?' open':'')+'" data-slug="'+s.slug+'" tabindex="0" onclick="go(\\''+s.slug+'\\')" onkeydown="if(event.key===\\'Enter\\')go(\\''+s.slug+'\\')">'
 +'<button class="more" title="Details" onclick="event.stopPropagation();toggle(\\''+s.slug+'\\',\\''+ctx+'\\')">'+(open?'▴':'▾')+'</button>'
 +(s.poster?'<div class="p"><img loading="lazy" src="'+s.poster+'" alt=""></div>':'<div class="p">'+esc(s.show)+'</div>')+'<div class="t"><b>'+esc(s.show)+'</b><small>'+esc(s.network||'')+(s.year?' · '+s.year:'')+' · '+total+' ep'+(total===1?'':'s')+(s.rating?' · ★ '+s.rating:'')+'</small></div>'
 +(ctx==='grid'?'<div class="indetail"><p>'+esc(s.overview||'No description yet.')+'</p><p class="g">'+esc(meta(s))+'</p></div>':'')+'</div>'}
function detail(s){return '<div class="detail">'+(s.poster?'<img src="'+s.poster+'" alt="">':'<div></div>')+'<div><b>'+esc(s.show)+'</b><p>'+esc(s.overview||'No description yet.')+'</p><div class="g">'+esc(meta(s))+'</div><div class="acts"><button class="btn" onclick="go(\\''+s.slug+'\\')">▶ Play</button><button class="btn" onclick="state.open=null;render()">Close</button></div></div></div>'}
function toggle(slug,ctx){state.open=state.open===slug?null:slug;state.openCtx=ctx;render();if(state.open&&ctx!=='grid'){const d=document.querySelector('.detail');if(d)d.scrollIntoView({block:'nearest',behavior:'smooth'})}}
function shelf(title,list,key){const id='t'+Math.random().toString(36).slice(2,8);const openHere=state.open&&state.openCtx===key&&list.some(s=>s.slug===state.open);
 return '<h2>'+esc(title)+'<small>'+list.length+' shows</small>'+(key.startsWith('type:')?'<span class="all" onclick="state.type=\\''+esc(title)+'\\';render();window.scrollTo(0,0)">See all ›</span>':key.startsWith('tag:')?'<span class="all" onclick="state.tag=\\''+esc(title)+'\\';render();window.scrollTo(0,0)">See all ›</span>':'')+'</h2>'
 +'<div class="rowwrap"><button class="arrow l" onclick="slide(\\''+id+'\\',-1)">‹</button><div class="track" id="'+id+'">'+list.map(s=>card(s,key)).join('')+'</div><button class="arrow r" onclick="slide(\\''+id+'\\',1)">›</button></div>'
 +(openHere?detail(list.find(s=>s.slug===state.open)):'')}
function slide(id,dir){const t=$(id);if(t)t.scrollBy({left:dir*(t.clientWidth-120),behavior:'smooth'})}
function browse(){const list=filtered();const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;
 let h='<div class="bar">'+sel('type','All rows',TYPES.map(t=>[t,SHOWS.filter(s=>s.type===t).length]).filter(x=>x[1]))+sel('tag','All collections',counts('tags'))+sel('genre','All genres',counts('genres'))+sel('network','All networks',counts('network').slice(0,60))+sel('decade','All decades',[['1990s'],['2000s'],['2010s'],['2020s']].map(([d])=>[d,SHOWS.filter(s=>decade(s.year)===d).length]))
 +'<select onchange="state.sort=this.value;render()">'+[['eps','Most episodes'],['rating','Top rated'],['year','Newest'],['old','Oldest'],['added','Recently added'],['az','A to Z']].map(([v,n])=>'<option value="'+v+'"'+(state.sort===v?' selected':'')+'>'+n+'</option>').join('')+'</select>'
 +'<span class="count">'+list.length+' shows · '+list.reduce((n,s)=>n+s.eps,0)+' episodes</span></div>';
 if(any)h+='<div class="chips">'+[['type',state.type],['tag',state.tag],['genre',state.genre],['network',state.network],['decade',state.decade]].filter(x=>x[1]).map(([k,v])=>'<span class="chip on" onclick="state.'+k+'=\\'\\';render()">'+esc(v)+' ✕</span>').join('')+(state.q?'<span class="chip on" onclick="state.q=\\'\\';$(\\'q\\').value=\\'\\';render()">“'+esc(state.q)+'” ✕</span>':'')+'</div>';
 if(any){h+='<div class="grid">'+list.map(s=>card(s,'grid')).join('')+'</div>';}
 else{
  const recent=[...SHOWS].sort((a,b)=>(b.matchedAt||'').localeCompare(a.matchedAt||'')).slice(0,30);
  h+=shelf('Recently added',recent,'recent');
  const top=[...SHOWS].filter(s=>s.rating).sort((a,b)=>b.rating-a.rating||b.eps-a.eps).slice(0,30);
  h+=shelf('Top rated',top,'top');
  for(const [tag] of counts('tags')){const rows=list.filter(s=>(s.tags||[]).includes(tag));if(rows.length)h+=shelf(tag,rows,'tag:'+tag)}
  for(const t of TYPES){const rows=list.filter(s=>s.type===t);if(rows.length)h+=shelf(t,rows,'type:'+t)}
 }
 if(!any){h+='<h2>Explore by Genre</h2><div class="genres">'+counts('genres').map(([g,n])=>'<button onclick="state.genre=\\''+esc(g)+'\\';render();window.scrollTo(0,0)">'+esc(g)+'<small>'+n+' shows</small></button>').join('')+'</div>';
  h+='<h2>By Network</h2><div class="genres">'+counts('network').slice(0,24).map(([g,n])=>'<button onclick="state.network=\\''+esc(g)+'\\';render();window.scrollTo(0,0)">'+esc(g)+'<small>'+n+' shows</small></button>').join('')+'</div>'}
 $('main').innerHTML=h}
function showView(autoplay){const s=state.show;const se=s.seasons[state.se];const ep=se.episodes[state.e];
 let h='<div class="show"><button class="back" onclick="go(\\'\\')">← Browse</button>';
 if(!autoplay)h+='<div class="hero">'+(s.backdrop?'<img src="'+s.backdrop+'" alt="">':'')+'<div class="t"><b>'+esc(s.show)+'</b>'+(s.overview?'<p>'+esc(s.overview.slice(0,260))+(s.overview.length>260?'…':'')+'</p>':'')+'<div class="g">'+[s.network,s.year,s.genres.join(' · '),s.rating?'★ '+s.rating:'',s.eps+' episodes'].filter(Boolean).join('  ·  ')+'</div></div></div>';
 h+='<div class="player"><div><video id="v" controls '+(autoplay?'autoplay':'')+' src="'+ep.url+'"></video><div class="now"><div><b>S'+String(se.season).padStart(2,'0')+'E'+String(ep.n).padStart(2,'0')+'</b> · '+esc(ep.name)+(ep.state==='REVIEW'?' <span class="rv">review</span>':'')+'</div><button class="btn" onclick="next()">Next episode ▶</button></div><p class="hint">Space / K play-pause · N next · F fullscreen · ← → skip 10s. "review" = the builder is not sure this file is this episode.</p></div>';
 h+='<div class="eps">'+s.seasons.map((x,si)=>'<h3>SEASON '+x.season+'</h3>'+x.episodes.map((y,ei)=>'<div class="ep '+(si===state.se&&ei===state.e?'on':'')+'" onclick="play('+si+','+ei+')"><span class="n">E'+y.n+'</span><span>'+esc(y.name)+'</span>'+(y.state==='REVIEW'?'<span class="rv">review</span>':'')+'<span class="m">'+y.min+'m</span></div>').join('')).join('')+'</div></div>';
 h+=xray(s)+'</div>';
 $('main').innerHTML=h;const v=$('v');v.onended=next;v.onerror=()=>{v.insertAdjacentHTML('afterend','<p style="color:#f66">This file would not play. Next episode in 3s…</p>');setTimeout(next,3000)}}
// X-RAY: who is in this show, where else they are on VOIDtv, and the shows connected through them.
function face(p){const open=state.person===p.id;return '<div class="face'+(open?' on':'')+'" onclick="person('+p.id+')">'+(p.photo?'<img loading="lazy" src="'+p.photo+'" alt="">':'<div class="ph"></div>')+'<b>'+esc(p.name)+'</b><small>'+esc(p.as||'')+'</small></div>'}
function personPanel(id,fallback){const g=PEOPLE[id];const name=g?g.name:fallback.name,photo=g?g.photo:fallback.photo;const others=g?Object.entries(g.shows).filter(([sl])=>sl!==state.show.slug&&BY_SLUG[sl]):[];
 return '<div class="person">'+(photo?'<img src="'+photo+'" alt="">':'<div></div>')+'<div><b>'+esc(name)+'</b><div class="g">'+(others.length?'Also on VOIDtv in '+others.length+' other show'+(others.length===1?'':'s'):'No other VOIDtv shows yet')+'</div>'
 +(others.length?'<div class="links">'+others.map(([sl,role])=>{const t=BY_SLUG[sl];return '<div class="plink" onclick="go(\\''+sl+'\\')">'+(t.poster?'<img src="'+t.poster+'" alt="">':'')+'<span>'+esc(t.show)+'<small>'+esc(role)+'</small></span></div>'}).join('')+'</div>':'')+'</div></div>'}
function xray(s){const links=LINKS[s.slug]||{};const conn=Object.entries(links).map(([sl,ids])=>({t:BY_SLUG[sl],via:ids.map(i=>PEOPLE[i]&&PEOPLE[i].name).filter(Boolean)})).filter(c=>c.t).sort((a,b)=>b.via.length-a.via.length).slice(0,24);
 if(!s.cast.length&&!s.crew.length&&!conn.length)return '';
 let h='<div class="xray">';
 if(s.cast.length){h+='<h3>CAST</h3><div class="faces">'+s.cast.map(face).join('')+'</div>';}
 if(s.crew.length){h+='<h3>MADE BY</h3><div class="faces">'+s.crew.map(face).join('')+'</div>';}
 if(state.person!=null){const p=[...s.cast,...s.crew].find(x=>x.id===state.person)||{name:'',photo:null};h+=personPanel(state.person,p);}
 if(conn.length){h+='<h3>CONNECTED SHOWS <small style="color:var(--dim);font-weight:400">· through the people above</small></h3><div class="conn">'+conn.map(c=>'<div class="card" onclick="go(\\''+c.t.slug+'\\')">'+(c.t.poster?'<div class="p"><img loading="lazy" src="'+c.t.poster+'" alt=""></div>':'<div class="p">'+esc(c.t.show)+'</div>')+'<div class="t"><b>'+esc(c.t.show)+'</b><span class="via">via '+esc(c.via.slice(0,2).join(', '))+(c.via.length>2?' +'+(c.via.length-2):'')+'</span></div></div>').join('')+'</div>';}
 return h+'</div>'}
function person(id){state.person=state.person===id?null:id;showView(false);const el=document.querySelector('.person');if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'})}
function go(slug){state.person=null;if(!slug){state.show=null;history.replaceState(null,'','#');render();return}const s=SHOWS.find(x=>x.slug===slug);if(!s)return;state.show=s;const r=resume(s);state.se=r.se;state.e=r.e;history.replaceState(null,'','#'+slug);render();window.scrollTo(0,0)}
function play(se,e){state.se=se;state.e=e;remember();showView(true)}
function next(){const s=state.show;if(state.e+1<s.seasons[state.se].episodes.length)play(state.se,state.e+1);else if(state.se+1<s.seasons.length)play(state.se+1,0)}
function remember(){try{localStorage.setItem('voidtv:'+state.show.slug,JSON.stringify({se:state.se,e:state.e}))}catch(_){}}
function resume(s){try{const r=JSON.parse(localStorage.getItem('voidtv:'+s.slug)||'');if(r&&s.seasons[r.se]&&s.seasons[r.se].episodes[r.e])return r}catch(_){}return{se:0,e:0}}
function render(){if(state.show)showView(false);else browse()}
document.addEventListener('keydown',(k)=>{if(k.target.tagName==='INPUT'||k.target.tagName==='SELECT')return;const v=$('v');if(k.key==='/'){k.preventDefault();$('q').focus();return}if(!v)return;if(k.key===' '||k.key==='k'){k.preventDefault();v.paused?v.play():v.pause()}if(k.key==='n')next();if(k.key==='f')v.requestFullscreen&&v.requestFullscreen();if(k.key==='ArrowRight')v.currentTime+=10;if(k.key==='ArrowLeft')v.currentTime-=10;if(k.key==='Escape')go('')});
if(location.hash.length>1)go(location.hash.slice(1));else render();
</script></body></html>`;
fs.writeFileSync(OUT, html);
console.log(`${shows.length} shows, ${shows.reduce((n, s) => n + s.eps, 0)} playable episodes -> ${path.relative(ROOT, OUT)}`);
