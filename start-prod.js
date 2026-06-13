// PROD launcher (Render, one service runs both): start the Spine, wait for it to be healthy,
// then start the backend. The backend is the public face on $PORT; the Spine is internal on
// SPINE_PORT (3002). If either process exits, this launcher exits so Render restarts the pair
// cleanly (no half-up state). stdout/stderr from both flow to Render Logs.
const { spawn } = require('child_process');
const path = require('path');

const SPINE_PORT = process.env.SPINE_PORT || '3002';
const children = [];

function run(name, file, cwd) {
  const p = spawn(process.execPath, [file], { cwd, stdio: 'inherit', env: process.env });
  children.push(p);
  p.on('exit', (code) => {
    console.error(`[start-prod] ${name} exited (${code}). Shutting down so Render restarts the pair.`);
    for (const c of children) { if (c !== p) try { c.kill(); } catch {} }
    process.exit(code || 1);
  });
  return p;
}

async function waitForSpine(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${SPINE_PORT}/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false; // start the backend anyway; it degrades gracefully (P8) until the Spine is up
}

(async () => {
  console.log('[start-prod] starting Spine...');
  run('spine', path.join(__dirname, 'spine', 'spine.js'), path.join(__dirname, 'spine'));
  const ok = await waitForSpine();
  console.log(`[start-prod] Spine ${ok ? 'healthy' : 'not healthy yet (starting backend anyway)'}; starting backend...`);
  run('backend', path.join(__dirname, 'backend', 'server.js'), path.join(__dirname, 'backend'));
})();
