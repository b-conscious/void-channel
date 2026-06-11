// Fixture regression run: one line of health per fixture. Exit 1 only on mapper THROWS for
// non-pending fixtures; metadata gaps are reported, not fatal (failures are expected output).
const mappers = require('./mappers.js');
const { fixtures } = require('../fixtures/fixtures.json');

(async () => {
  let thrown = 0;
  for (const f of fixtures) {
    if (f.id.startsWith('PENDING_B')) { console.log(`SKIP  ${f.type.padEnd(5)} ${f.id}`); continue; }
    try {
      const d = await mappers.getDetailedItem(f.id, f.type);
      const mark =
        f.type === 'video' ? (d.videoUrl ? 'PLAYS' : 'NOURL') :
        f.type === 'audio' ? (d.tracks && d.tracks.length ? `${d.tracks.length}trk` : 'NOTRK') :
        f.type === 'game' ? (d.emulator ? d.emulator : 'NOEMU') :
        (d.formats && d.formats.length ? `${d.formats.length}fmt` : 'NOFMT');
      console.log(`OK    ${f.type.padEnd(5)} ${f.id.slice(0, 50).padEnd(52)} ${mark}`);
    } catch (err) {
      thrown++;
      console.log(`THROW ${f.type.padEnd(5)} ${f.id.slice(0, 50).padEnd(52)} ${String(err.message).slice(0, 60)}`);
    }
  }
  console.log(thrown ? `\n${thrown} fixture(s) THREW` : '\nall fixtures mapped without throwing');
  process.exit(thrown ? 1 : 0);
})();
