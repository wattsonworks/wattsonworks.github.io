/*
 * Serve this repo from your own machine, for playing on the phone over Tailscale.
 *
 *   node dune-pilgrim/tools/serve.mjs            # port 8080, whole repo
 *   node dune-pilgrim/tools/serve.mjs --port 9000
 *
 * It binds 0.0.0.0 on purpose — 127.0.0.1 would be reachable from the machine
 * itself and nothing else, which is the usual reason the phone sees nothing.
 * On start it prints every address it is reachable on and marks the Tailscale
 * one (100.64.0.0/10, the CGNAT range tailnets use).
 *
 * Plain http over the tailnet is enough for this game: Web Audio, localStorage
 * and fullscreen all work without a secure context, and the entry tap unlocks
 * audio the way iOS wants. If you would rather have real HTTPS — which you need
 * for anything added later that demands a secure context — leave this running
 * and put Tailscale in front of it:
 *
 *   tailscale serve --bg 8080
 *   → https://<machine>.<tailnet>.ts.net/dune-pilgrim/play/
 *   tailscale serve --https=443 off      # when you are done
 *
 * Nothing here is exposed to the internet: a tailnet address is only reachable
 * by your own devices. `tailscale funnel` is the one that publishes publicly —
 * do not reach for it by accident.
 */

import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');                       // the repo root
const argv = process.argv.slice(2);
const PORT = Number(argv[argv.indexOf('--port') + 1]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const target = resolve(ROOT, '.' + normalize(path));
  if (!target.startsWith(ROOT)) { res.writeHead(403).end('nope'); return; }

  let file = target;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + path);
    console.log('  404', path);
    return;
  }

  const size = statSync(file).size;
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',                            // so an edit shows on reload
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
  console.log('  200', path, (size / 1024).toFixed(0) + 'k');
});

server.listen(PORT, '0.0.0.0', () => {
  const rows = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const oct = a.address.split('.').map(Number);
      const tailscale = oct[0] === 100 && oct[1] >= 64 && oct[1] <= 127;
      rows.push({ name, address: a.address, tailscale });
    }
  }
  const PLAY = `/dune-pilgrim/play/`;
  console.log(`\nDUNE PILGRIM — serving ${ROOT} on port ${PORT}\n`);
  console.log(`  this machine   http://localhost:${PORT}${PLAY}`);
  for (const r of rows) {
    console.log(`  ${r.tailscale ? 'TAILSCALE     ' : 'lan (' + r.name.slice(0, 8).padEnd(8) + ')'} http://${r.address}:${PORT}${PLAY}`);
  }
  if (!rows.some(r => r.tailscale)) {
    console.log('\n  No 100.x address found — is Tailscale up? (tailscale status)');
  }
  console.log(`\n  On the phone, MagicDNS is easier than the number:`);
  console.log(`  http://<this-machine-name>:${PORT}${PLAY}`);
  console.log(`\n  The project page is at ${'/dune-pilgrim/'} · ctrl-c to stop\n`);
});
