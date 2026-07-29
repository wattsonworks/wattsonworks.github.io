# Dune Pilgrim — working on the game

## Playing it on the phone, off your own machine

```sh
git clone -b claude/new-session-sdrw00 https://github.com/wattsonworks/wattsonworks.github.io
cd wattsonworks.github.io
node dune-pilgrim/tools/serve.mjs          # binds 0.0.0.0:8080, prints every address
```

It marks the Tailscale address (`100.x.x.x`) in its output, but MagicDNS is
easier to type on a phone:

```
http://<this-machine-name>:8080/dune-pilgrim/play/
```

Then **Share → Add to Home Screen**. The page declares itself a full-screen web
app with its own icon, so it opens with no Safari chrome — which on a phone is
the difference between playing it and looking at it through a browser.

Plain http is fine over a tailnet: Web Audio, `localStorage` and fullscreen do
not require a secure context, and the entry tap is what unlocks audio on iOS.
For real HTTPS, leave the server running and put Tailscale in front of it:

```sh
tailscale serve --bg 8080                  # https://<machine>.<tailnet>.ts.net/dune-pilgrim/play/
tailscale serve --https=443 off            # when you are done
```

A tailnet address is reachable only by your own devices. `tailscale funnel` is
the one that publishes to the whole internet — different command, on purpose.

No Node on the machine? `python3 -m http.server 8080 --bind 0.0.0.0` from the
repo root serves the same paths, without the address printout.


The game is one hand-edited HTML file (`../play/index.html`). No build step, no
bundler, no modules — every change is a surgical string replacement inside that
file. `HANDOFF.txt` in the parent folder is the full context: invariants, the
systems map, the roadmap, and the mistakes that produced these gates.

## Before you present anything

```sh
node dune-pilgrim/tools/check.mjs            # all gates, ~60s
node dune-pilgrim/tools/check.mjs --static   # ~1s, no browser
```

| gate | what it catches |
|---|---|
| **1 — static** | a `<script>` left unparseable by a bad replacement; a uniform declared twice in one stage (shared `GLSL_*` blocks are expanded into each stage first, which is where the duplicates come from); an identifier read before its declaration, per function body, because GLSL does not hoist |
| **3 — gl** | every `compileShader` and `linkProgram` on the live SwiftShader context, reported with the offending source line; plus every `uniform{2,3,4}fv` upload checked for a value with a `length` — a `THREE.Color` handed to a `vec3` uniform compiles clean and then kills the frame loop on the device |
| **4 — entry** | loads the page, taps to enter, and reads `#hint`. If init or entry threw, the hint holds the error text instead of the controls. This is the gate that catches "the user sees a dark screen with a small error" |

Gate 2 from the handoff — the headless sim harness with the feature probes
(hair roots, dress clearance, deltas, caravans, away-growth, all 16 spells) — is
**not** rebuilt here. If you touch physics or a system, that suite is still the
one that would catch you, and it needs writing.

The gates are self-tested: each one was confirmed to fire on a deliberately
broken copy (an eaten brace, a duplicated `uniform float uTime`, a `uGlowTypo`
in a fragment shader) and to stay quiet on the shipped file. When you add a
gate, break something on purpose and watch it fail before you trust it.

Requires `playwright` — resolved from a local install, a global one, or run
`--static` alone to skip the browser entirely.

## Things this repo does differently from the handoff

- **three.js is vendored** at `../play/vendor/three.r128.min.js` instead of
  loaded from cdnjs, so the page survives a CDN outage. Keep it at r128.
- **No `.txt` mirror is committed.** The Claude artifact viewer needs one, but a
  second copy of a 3.4 MB file in git is not worth it — mirror locally after
  each edit: `cp dune-pilgrim/play/index.html ~/dune-pilgrim.txt`
- The head carries canonical/OG tags and the entry veil carries a link back to
  `/dune-pilgrim/`. Both live outside the game's IIFE; the back link calls
  `stopPropagation` so it does not trip the veil's own enter handler.
