/*
 * DUNE PILGRIM — verification gates.
 *
 * From the project handoff: the game is one hand-edited HTML file, so every
 * change is a surgical string replacement and every class of bug that ever
 * reached the device came back through one of these doors. Run this after any
 * edit to play/index.html.
 *
 *   node dune-pilgrim/tools/check.mjs                 # all gates
 *   node dune-pilgrim/tools/check.mjs --static        # gate 1 only (~1s, no browser)
 *   node dune-pilgrim/tools/check.mjs --gl --entry    # pick gates
 *   node dune-pilgrim/tools/check.mjs --file other.html
 *
 * GATE 1 (static)  parses every inline <script> and lints the GLSL string
 *                  blocks for the two mistakes that survive a bad replacement:
 *                  a uniform declared twice in one stage, and an identifier
 *                  read before its declaration (GLSL does not hoist).
 * GATE 3 (gl)      boots the page in headless Chromium with SwiftShader and
 *                  wraps the live WebGL context: every compileShader and
 *                  linkProgram is checked, and every uniform{2,3,4}fv upload is
 *                  checked for a value with a length. Compiling proves the GLSL
 *                  parses; the upload trap is what catches a THREE.Color handed
 *                  to a vec3 uniform, which compiles clean and then kills the
 *                  frame loop on the device.
 * GATE 4 (entry)   loads the page, taps to enter, and reads the on-screen hint.
 *                  If init or entry threw, the hint holds the error text
 *                  instead of the controls — the only gate that catches
 *                  "the user sees a dark screen with a small error".
 *
 * Gate 2 from the handoff — the headless sim harness with the feature probes —
 * is not rebuilt here.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const FILE = resolve(HERE, arg('file', '../play/index.html'));
const picked = ['static', 'gl', 'entry'].filter(g => argv.includes('--' + g));
const GATES = picked.length ? picked : ['static', 'gl', 'entry'];

if (!existsSync(FILE)) { console.error('no such file:', FILE); process.exit(2); }
const SRC = readFileSync(FILE, 'utf8');

let failures = 0;
const fail = (gate, msg) => { failures++; console.log(`  FAIL  [${gate}] ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

/* ─────────────────────────── GATE 1 — static ─────────────────────────── */

function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({ code: m[1], line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

/* GLSL lives in this file as arrays joined with "\n", and a stage array splices
   in shared constants (GLSL_LAND_HEAD, GLSL_SKY, GLSL_FOG) alongside its own
   quoted lines. Those constants already declare uSub, uCamPos, uTime and more,
   so a stage is only lintable once they are expanded into it — that is exactly
   where the duplicate-uniform bug lives. */
function arrayJoins(code) {
  /* every [ ... ].join("\n") in the file, with its elements at depth 1 */
  const out = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== '[') continue;
    let depth = 0, j = i, str = null, elems = [], cur = '';
    for (; j < code.length; j++) {
      const c = code[j];
      if (str) {
        cur += c;
        if (c === '\\') { cur += code[++j] ?? ''; continue; }
        if (c === str) str = null;
        continue;
      }
      if (c === '"' || c === "'") { str = c; cur += c; continue; }
      if (c === '[' || c === '(' || c === '{') { depth++; if (depth > 1) cur += c; continue; }
      if (c === ']' || c === ')' || c === '}') { depth--; if (depth === 0) break; cur += c; continue; }
      if (c === ',' && depth === 1) { elems.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (depth !== 0) continue;
    elems.push(cur.trim());
    if (!/^\s*\.join\(\s*["']\\n["']\s*\)/.test(code.slice(j + 1))) { continue; }
    out.push({ start: i, elems: elems.filter(Boolean), line: code.slice(0, i).split('\n').length });
    i = j;
  }
  return out;
}

const unquote = s => s.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');

function glslBlocks(code) {
  const joins = arrayJoins(code);

  /* named shared constants, plus `var GLSL_LAND_HEAD = GLSL_LAND;` aliases */
  const consts = new Map();
  for (const j of joins) {
    const before = code.slice(Math.max(0, j.start - 60), j.start);
    const m = before.match(/var\s+(GLSL_[A-Z_0-9]+)\s*=\s*$/);
    if (m) consts.set(m[1], j.elems.filter(e => /^["']/.test(e)).map(unquote));
  }
  for (const m of code.matchAll(/var\s+(GLSL_[A-Z_0-9]+)\s*=\s*(GLSL_[A-Z_0-9]+)\s*;/g)) {
    if (consts.has(m[2])) consts.set(m[1], consts.get(m[2]));
  }

  const blocks = [];
  for (const j of joins) {
    const before = code.slice(Math.max(0, j.start - 60), j.start);
    if (/var\s+GLSL_[A-Z_0-9]+\s*=\s*$/.test(before)) continue;   // the constant itself
    const lines = [];
    for (const e of j.elems) {
      if (/^["']/.test(e)) lines.push(unquote(e));
      else if (consts.has(e)) lines.push(...consts.get(e));
    }
    if (lines.some(l => /\b(gl_FragColor|gl_Position|void\s+main)\b/.test(l))) {
      blocks.push({ lines, at: j.line, shared: j.elems.filter(e => consts.has(e)) });
    }
  }
  return { blocks, consts };
}

const TYPES = 'float|vec2|vec3|vec4|int|ivec2|ivec3|ivec4|bool|bvec2|bvec3|bvec4|mat2|mat3|mat4';
const BUILTIN = new RegExp(`^(${TYPES}|abs|min|max|mix|clamp|dot|cross|normalize|length|pow|exp|exp2|log|log2|sqrt|sin|cos|tan|atan|asin|acos|floor|ceil|fract|mod|step|smoothstep|texture2D|textureCube|reflect|refract|faceforward|distance|sign|inversesqrt|radians|degrees|dFdx|dFdy|fwidth|discard|return|if|else|for|while|true|false|in|out|inout|const|struct|gl_\\w+)$`);

/* Walk each function body on its own. A name is fine if it is a global, a
   parameter, or already declared above in this body; it is a bug only when the
   very same body declares it further down. */
function orderLint(block, report) {
  const globals = new Set();
  for (const ln of block.lines) {
    const g = ln.match(new RegExp(`^\\s*(?:uniform|attribute|varying|const)\\s+(?:${TYPES}|\\w+)\\s+([\\w\\s,\\[\\]]+);`));
    if (g) g[1].split(',').forEach(n => globals.add(n.trim().replace(/\[.*$/, '')));
    const f = ln.match(/^\s*(?:\w+)\s+(\w+)\s*\(/);
    if (f) globals.add(f[1]);
  }

  let hits = 0, depth = 0, body = null;
  const flush = () => {
    if (!body) return;
    const declAt = new Map();
    body.lines.forEach((ln, i) => {
      const d = ln.match(new RegExp(`^\\s*(?:${TYPES})\\s+([\\w\\s,=.+\\-*/()\\[\\]]+);`));
      if (!d) return;
      d[1].split(',').forEach(part => {
        const n = part.split('=')[0].trim().replace(/\[.*$/, '');
        if (n && !declAt.has(n)) declAt.set(n, i);
      });
    });
    body.lines.forEach((ln, i) => {
      const decl = ln.match(new RegExp(`^\\s*(?:${TYPES})\\s+([\\w\\s,=.+\\-*/()\\[\\]]+);`));
      let read = decl ? decl[1].split('=').slice(1).join('=') : ln;
      read = read.replace(/\.\s*[a-zA-Z_]\w*/g, ' ');   // .xyz / .w are swizzles, not names
      for (const id of read.match(/\b[a-zA-Z_]\w*\b/g) || []) {
        if (BUILTIN.test(id) || globals.has(id) || body.params.has(id)) continue;
        const at = declAt.get(id);
        if (at !== undefined && at > i) {
          report(`"${id}" is read before its declaration inside ${body.name}() (stage near source line ${block.at})`);
          hits++;
        }
      }
    });
    body = null;
  };

  block.lines.forEach(ln => {
    const open = (ln.match(/\{/g) || []).length, close = (ln.match(/\}/g) || []).length;
    if (depth === 0 && open > 0) {
      const sig = ln.match(/^\s*\w+\s+(\w+)\s*\(([^)]*)\)/);
      const params = new Set();
      if (sig) sig[2].split(',').forEach(p => { const t = p.trim().split(/\s+/).pop(); if (t) params.add(t.replace(/\[.*$/, '')); });
      body = { name: sig ? sig[1] : '<anon>', params, lines: [] };
    } else if (body) body.lines.push(ln);
    depth += open - close;
    if (depth <= 0) { flush(); depth = 0; }
  });
  flush();
  return hits;
}

function gateStatic() {
  console.log('\nGATE 1 — static');
  const scripts = inlineScripts(SRC);
  pass(`${scripts.length} inline script blocks found`);

  for (const s of scripts) {
    try { new vm.Script(s.code); }
    catch (e) { fail('parse', `script at line ~${s.line}: ${e.message}`); }
  }
  if (!failures) pass('every inline script parses');

  const { blocks, consts } = glslBlocks(SRC);
  pass(`${blocks.length} GLSL stages recovered, ${consts.size} shared blocks expanded into them`);

  let dupes = 0, uses = 0;
  for (const b of blocks) {
    // a uniform declared twice in one stage
    const seen = new Map();
    b.lines.forEach((ln, i) => {
      const m = ln.match(/^\s*uniform\s+\w+\s+([\w\s,\[\]]+);/);
      if (!m) return;
      m[1].split(',').map(n => n.trim().replace(/\[.*$/, '')).filter(Boolean).forEach(n => {
        if (seen.has(n)) { fail('glsl-dup', `uniform "${n}" declared twice in the stage near source line ${b.at} (block lines ${seen.get(n)} and ${i})`); dupes++; }
        else seen.set(n, i);
      });
    });

    // a local read before its own declaration — per function body, since GLSL
    // scopes to the body and a name declared in one function says nothing here
    uses += orderLint(b, (msg) => fail('glsl-order', msg));
  }
  if (!dupes) pass('no uniform declared twice in a stage');
  if (!uses) pass('no identifier read before its declaration');

  // the handoff's reserved-word trap
  const reserved = ['cast', 'sample', 'input', 'output', 'filter', 'union', 'this', 'namespace'];
  for (const b of blocks) {
    for (const w of reserved) {
      if (b.lines.some(l => new RegExp(`\\b(?:float|vec2|vec3|vec4|int|bool)\\s+${w}\\b`).test(l))) {
        fail('glsl-reserved', `"${w}" is a reserved word in GLSL (stage near source line ${b.at})`);
      }
    }
  }
}

/* ───────────────────────── GATES 3 + 4 — browser ───────────────────────── */

async function loadPlaywright() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return await import(spec); } catch { /* try the next one */ }
  }
  return null;
}

/* Wrap the live context before the game touches it. Everything the page
   compiles, links or uploads goes through here. */
const TRAP = () => {
  window.__gl = { shaders: [], programs: [], uniforms: [] };
  const G = WebGLRenderingContext.prototype, G2 = window.WebGL2RenderingContext?.prototype;
  for (const proto of [G, G2].filter(Boolean)) {
    const compileShader = proto.compileShader;
    proto.compileShader = function (sh) {
      compileShader.call(this, sh);
      if (!this.getShaderParameter(sh, this.COMPILE_STATUS)) {
        const log = this.getShaderInfoLog(sh) || '';
        const src = (this.getShaderSource(sh) || '').split('\n');
        const nums = [...log.matchAll(/ERROR:\s*\d+:(\d+)/g)].map(m => +m[1]);
        window.__gl.shaders.push({
          log: log.slice(0, 900),
          context: nums.slice(0, 4).map(n => `${n}: ${src[n - 1] ?? ''}`.slice(0, 160)),
        });
      }
    };
    const linkProgram = proto.linkProgram;
    proto.linkProgram = function (pr) {
      linkProgram.call(this, pr);
      if (!this.getProgramParameter(pr, this.LINK_STATUS)) {
        window.__gl.programs.push((this.getProgramInfoLog(pr) || '').slice(0, 500));
      }
    };
    for (const fn of ['uniform2fv', 'uniform3fv', 'uniform4fv']) {
      const orig = proto[fn];
      proto[fn] = function (loc, val) {
        if (val == null || typeof val.length !== 'number') {
          const seen = val && val.constructor ? val.constructor.name : String(val);
          if (window.__gl.uniforms.length < 12) window.__gl.uniforms.push(`${fn} got ${seen} (no length)`);
        }
        return orig.apply(this, arguments);
      };
    }
  }
};

async function gatesBrowser(which) {
  const pw = await loadPlaywright();
  if (!pw) { fail('browser', 'playwright not found — npm i -D playwright, or run with --static'); return; }

  const browser = await pw.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const thrown = [];
  page.on('pageerror', e => { if (!/decode audio data/i.test(e.message)) thrown.push(e.message.slice(0, 200)); });
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) thrown.push(m.text().slice(0, 200)); });

  await page.addInitScript(TRAP);
  await page.goto(pathToFileURL(FILE).href, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  if (which.includes('gl')) {
    console.log('\nGATE 3 — shaders and uniform uploads');
    const gl = await page.evaluate(() => window.__gl);
    if (gl.shaders.length) gl.shaders.forEach(s => fail('glsl', s.log + (s.context.length ? '\n          ' + s.context.join('\n          ') : '')));
    else pass('every shader compiled');
    if (gl.programs.length) gl.programs.forEach(p => fail('link', p));
    else pass('every program linked');
    if (gl.uniforms.length) [...new Set(gl.uniforms)].forEach(u => fail('uniform', u));
    else pass('every vec uniform uploaded with a length');
  }

  if (which.includes('entry')) {
    console.log('\nGATE 4 — init and entry');
    await page.mouse.click(450, 280);
    await page.waitForTimeout(5000);
    const hint = (await page.textContent('#hint').catch(() => '')) || '';
    if (/error/i.test(hint)) fail('entry', `the hint is showing an error: ${hint.slice(0, 200)}`);
    else if (!hint.trim()) fail('entry', 'the hint is empty — the controls never rendered');
    else pass(`the hint still reads as controls ("${hint.trim().split('\n')[0].slice(0, 52)}…")`);
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (canvases < 2) fail('entry', `expected the renderer canvas plus the ink canvas, found ${canvases}`);
    else pass(`${canvases} canvases live`);
    if (thrown.length) [...new Set(thrown)].forEach(t => fail('runtime', t));
    else pass('nothing thrown during init or entry');
  }

  await browser.close();
}

/* ──────────────────────────────── run ──────────────────────────────── */

console.log('DUNE PILGRIM — checking', FILE.replace(process.cwd() + '/', ''));
if (GATES.includes('static')) gateStatic();
if (GATES.includes('gl') || GATES.includes('entry')) await gatesBrowser(GATES);

console.log(failures ? `\n${failures} failure(s)\n` : '\nall gates passed\n');
process.exit(failures ? 1 : 0);
