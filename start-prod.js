// PROD launcher (Render, one 512 MB service runs both). HARD LESSON (2026-06-12 cutover):
// coupling the two processes turned a Spine OOM during the first sync into a full-service
// 502 crash-loop. So now:
//   - BACKEND is primary: starts first, is the public face on $PORT. If IT dies, we exit so
//     Render restarts. The site's availability tracks the backend ONLY.
//   - SPINE is a restartable secondary: starts a few seconds later, and if it crashes (e.g.
//     OOM mid-sync) we LOG it and restart it with backoff — the backend stays up the whole
//     time (the wall just shows "warming" until pools fill). Never takes the site down.
//   - Both run with capped V8 heaps so their combined RSS fits in 512 MB. Pools are committed
//     before the heavy regroup, so the wall fills even if a later step makes the Spine recycle.
const { spawn } = require('child_process');
const path = require('path');

const BACKEND_HEAP = process.env.BACKEND_HEAP_MB || '256';
const SPINE_HEAP = process.env.SPINE_HEAP_MB || '144';

function startBackend() {
  console.log('[start-prod] starting backend (primary)...');
  const p = spawn(process.execPath, [`--max-old-space-size=${BACKEND_HEAP}`, path.join(__dirname, 'backend', 'server.js')],
    { cwd: path.join(__dirname, 'backend'), stdio: 'inherit', env: process.env });
  p.on('exit', (code) => {
    console.error(`[start-prod] backend exited (${code}). Exiting so Render restarts the service.`);
    process.exit(code || 1);
  });
}

let spineAttempts = 0;
function startSpine() {
  spineAttempts++;
  console.log(`[start-prod] starting spine (secondary, attempt ${spineAttempts})...`);
  const p = spawn(process.execPath, [`--max-old-space-size=${SPINE_HEAP}`, path.join(__dirname, 'spine', 'spine.js')],
    { cwd: path.join(__dirname, 'spine'), stdio: 'inherit', env: process.env });
  p.on('exit', (code) => {
    const delay = Math.min(120000, 10000 * spineAttempts); // 10s, 20s ... cap 2m
    console.error(`[start-prod] spine exited (${code}). Backend stays up; restarting spine in ${delay / 1000}s.`);
    setTimeout(startSpine, delay);
  });
}

startBackend();
// Let the backend bind $PORT before the Spine starts competing for memory.
setTimeout(startSpine, 8000);
