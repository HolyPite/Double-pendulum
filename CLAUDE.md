# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-simulation interactive lab ("Laboratoire de Simulations") — a collection of canvas-based physics/emergence simulations behind a shared shell. Pure vanilla JS + HTML5 Canvas + CSS — no build system, no dependencies, no package.json, no tests, no linter.

**Run:** open `index.html` directly in a browser (works over `file://`; no server needed). There are no build/test commands. `node --check js/**/*.js` is the only available verification.

UI text, code comments, and commit messages are in French. Commits follow conventional-commit style (`feat(audio): ...`, `feat(ui): ...`).

## Files

- `index.html` — shell DOM (control bar, sim switcher, help overlay, side panel) + one `<div class="sim-panel" id="panel-<simId>">` per simulation containing its settings controls. Scripts are loaded as plain `<script>` tags (engine first, then sims, then `Engine.start('pendulum')`). Assets use a `?v=N` cache-busting query — bump it when stale-cache issues matter.
- `js/engine.js` — the shared shell (see below).
- `js/sims/*.js` — one file per simulation: `pendulum.js`, `fluid.js`, `sand.js`, `boids.js`, `particlelife.js`, `grayscott.js`, `gameoflife.js`, `waves.js`, `physarum.js`. Each is an IIFE that calls `Engine.register({...})`; no globals leak except via the registry.
- `style.css` — all styling, including generic `.sim-panel` / `.panel-body` / `.setting-group` classes reused by every sim panel.
- `mds/` — French planning docs. `SIMULATIONS.md` is the idea catalog/roadmap for new sims; update it when adding one. Also `TODO.md`, `IDEAS.md`, `FEATURES.md`.

## Architecture

**Engine (`js/engine.js`).** Owns the single full-screen canvas, the rAF loop, FPS measurement, pause state, and all global UI: sim switcher tabs (top center, generated from the registry), Pause/Reset/Effacer/Réglages buttons, the help overlay (rebuilt per sim from `sim.help`), the side panel chrome, global keyboard shortcuts (Space, R, C, F, ?, Escape — anything else is forwarded to `sim.onKey`), and mouse/touch forwarding (touch is translated to synthetic mouse events). Exposes `Engine.register/start/switchTo/setPaused`, plus getters `Engine.paused`, `Engine.fps`, `Engine.width/height`, `Engine.canvas/ctx`.

**Sim interface.** A sim is an object with `id`, `name`, `icon`, `hint`, `help` and optional lifecycle hooks — the full contract is documented in the header comment of `js/engine.js`. Key conventions:
- `init()` runs once at first activation (bind panel controls there); `activate()`/`deactivate()` run on every switch (set `document.body.style.backgroundColor`, start/stop audio, etc.).
- `update(dt)` is called every frame even when paused — sims must check `Engine.paused` themselves (this lets e.g. the sand brush paint and the pendulum drag work while paused).
- `draw(ctx, w, h)` must fully repaint (or deliberately accumulate, like attractor/trail modes) and must reset any canvas state it changes (`shadowBlur`, `globalAlpha`, `globalCompositeOperation`).
- `clear()` is optional; if absent the Effacer button is hidden and the C key does nothing.
- Adding a sim = new file in `js/sims/` + `<script>` tag in `index.html` + a `panel-<id>` div. Prefix the panel's element IDs with a short sim code (`fl_`, `sd_`, `bd_`) since all panels share one document.

**Pendulum specifics** (`js/sims/pendulum.js`, the largest sim):
- Generalized N-arm pendulum integrated with RK4 at fixed `dt = 0.2`, `settings.simSpeed` sub-steps per frame. `computeDerivatives()` builds the Lagrangian mass matrix and solves it with `solveLinearSystem()` (Gaussian elimination). Air resistance is the per-step velocity multiplier `f_drag`, manually recomputed wherever `settings.resistance` changes.
- State: an "arm" is `{r, m, a, v, color}`. `pendulums[0]` is the master (dragged, traced, sonified); `pendulums[1..]` are butterfly-effect clones (re-synced to master on drag release, sim speed capped by FPS). `multiPendulums` are independent pendulums with own pivots/trails; when `settings.multiMode` is on, the master is neither simulated nor drawn and dragging is disabled.
- `settings` is the source of truth; `syncUIToSettings()` pushes it back into the DOM, `rebuildArmDetails()` regenerates per-arm sliders on every `initSimulation()`. Scenarios (keys 1–6) and localStorage presets (`dp_presets`) funnel through `applyScenario()`/`initSimulation(customParams)`. Scenario `resistance` values are in % — same unit as the slider (do not rescale).
- Themes (`themes` object) control bg/glow/composite; theme branches are scattered through the draw functions, so a new theme means touching `drawMass`, `draw`, and trail rendering.

**Other sims:** `fluid.js` is a Jos Stam "Stable Fluids" solver (128² grid, Float32Arrays, vorticity confinement, RGB dye advected and rendered via an offscreen ImageData stretched to screen). `sand.js` is a falling-sand cellular automaton (4px cells, Uint8Array, bottom-up scan for falling materials and top-down for rising ones so a moved cell is never processed twice per frame; alternating scan direction for symmetry). `boids.js` is classic Reynolds flocking, O(n²) neighbor search (fine ≤ 500 boids — add spatial hashing before raising the cap). `particlelife.js` uses a spatial grid (Int32Array linked lists) and a toroidal world; its interaction matrix editor lives in the panel. `grayscott.js`, `gameoflife.js`, `waves.js`, `physarum.js` all follow the same grid pattern: typed arrays at a reduced resolution (`SCALE` px/cell), offscreen canvas + ImageData, stretched to screen (smoothing on for continuous fields, off for cellular ones). Grids wrap toroidally except waves (absorbing borders). Right-click is an eraser tool where relevant (the engine suppresses the context menu).

A common pitfall on Windows PowerShell 5.1: don't rewrite UTF-8 source files via `Get-Content | Set-Content` — it mangles accented characters (no BOM detection). Use the Edit/Write tools instead.
