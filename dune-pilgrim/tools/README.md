# Dune Pilgrim — working on the game

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
