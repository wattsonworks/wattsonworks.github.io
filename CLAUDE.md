# wattsonworks.github.io

The portfolio of Mor Moshe Menahem (Safed, IL) — a static GitHub Pages user
site. No build step anywhere in this repo: every page is hand-written HTML with
its CSS and JS inline, and vendored libraries live beside the page that uses
them. Do not introduce a bundler, a framework or a package manager step.

## Layout

    index.html              the whole portfolio — "The Safed Exchange"
    assets/                 shared media; assets/work/* are the board thumbnails
    assets/vendor/          gsap, lenis, three (module build) for the front page
    dune-pilgrim/           the game's dedicated area (see its own docs below)
    sitemap.xml             INDEX of per-project sitemaps, not a URL list
    sitemap-root.xml        the front page's own URLs
    robots.txt              authoritative for the whole origin — per-project
                            robots.txt files are NOT read by crawlers here

Most other projects (roux, LIQUIDEX, JESTA, isra-peptides, …) are separate
repos published under the same origin. They are not in this working tree; only
their sitemap entries are.

## The front page

`index.html` is one file, around 2,500 lines, ordered: head + JSON-LD → CSS →
markup → JS. When you touch it, keep these in sync or the page lies about
itself:

- **A new listing** needs all of: the `<li class="listing">` block, its
  `l-idx` number, the `idx-readout` count, the JSON-LD `itemListElement`, the
  hidden `.vh` summary paragraph, the ticker `segs` array, and the ⌘K command
  list. Grep for an existing ticker (`DUNE`, `ROUT`) to find every site.
- **The board is pinned to one screen** in exchange mode. `layoutDetail()`
  measures the rows, adds `.tight` if the open detail pane would be squeezed,
  and measures again. Adding rows eats that budget — check it at 800px and
  960px viewport heights, not just your own window.
- Sector heads are `Sector NN — Name` with a Hebrew counterpart. Hebrew is
  first-class on this site: keep `dir="rtl" lang="he"` on every Hebrew span.
- Prices, tickers and the solar clock are theatre driven by JS. They are
  deliberate; do not "fix" them into static text.

## dune-pilgrim/

A procedural desert/ocean game, built in conversation and handed over with
notes. **Read `dune-pilgrim/HANDOFF.txt` before touching `play/index.html`** —
it carries the invariants, the systems map, the 18-item roadmap and the bugs
that produced the test gates. The essentials:

- `play/index.html` is ONE self-contained file, ~3.4 MB, of which ~3.2 MB is
  two base64 audio tracks. Do not "optimise" the audio away. There is no build
  step; every change is a surgical string replacement.
- three.js **r128** is vendored at `play/vendor/`. Keep it local, keep it r128.
- Several rules exist in both JavaScript (physics) and GLSL (rendering) —
  terrain height, ceiling height, water visibility. Change one, change the
  other in the same edit. Every drift here has produced a visible bug.
- **Run the gates after every edit**: `node dune-pilgrim/tools/check.mjs`
  (static + gl + entry). `--static` alone is a second. See
  `dune-pilgrim/tools/README.md`. Gate 2 from the handoff — the sim harness
  with the feature probes — was never rebuilt; a green run does not cover
  physics or gameplay.
- Play it on a phone with `node dune-pilgrim/tools/serve.mjs`, which binds
  0.0.0.0 and prints the Tailscale URL.

## House style

- No emoji in code or output — the owner has asked for this explicitly.
- Comments explain *why*, in plain prose, and match the density around them.
- British-ish, unhurried voice in copy. No marketing filler.
- Claim only what you verified. Screenshot or run the page before saying it
  works; this repo has no tests beyond the game's gates.

## Publishing

GitHub Pages serves `main`. Work happens on a branch and only reaches the live
site when `main` moves — merging is the owner's call, never assume it.
