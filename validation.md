# Box & Bones — Validation Contract

This document is the feature contract for the game. Every numbered assertion
below is verified, in order, by `validation.spec.js` — a single Playwright
test that plays through the game against the production build (`vite build`
+ `vite preview`, the same output GitHub Pages serves) and records a trace.

Run it with:

```bash
npm install
npx playwright install chromium   # first time only
npm run validate
```

This produces `trace.zip` in the repo root. Inspect it with
`npx playwright show-trace trace.zip` or by dragging it onto
https://trace.playwright.dev — every step below appears as a named step in
the trace, with DOM snapshots and screenshots.

Console errors are collected for the entire run; the final assertion (V18)
fails if any occurred at any point.

---

## Boot & start

- **V1 — The game boots.** Loading the page shows the start overlay with the
  title "Box & Bones" and a Begin button. Nothing else is interactive yet.
- **V2 — Begin starts the game inside the box.** Clicking Begin hides the
  overlay. The player is in the inventory-box room (top-down scene), the
  HUD reads "Inside The Box", the audio context is running, and the box
  music track (the music-box loop) is the active track.

## The inventory box room

- **V3 — How To Play poster.** Walking near the poster shows an interact
  prompt naming it; pressing E opens a modal whose content explains the
  game. Escape closes it.
- **V4 — Controls poster with live rebinding.** The Controls modal lists
  every action with its current key. Clicking a binding then pressing a new
  key rebinds it (the button label updates, the binding persists to
  localStorage); rebinding back restores the original.
- **V5 — Settings poster.** The Settings modal has a Music Volume slider,
  a Sound Effects Volume slider, and a Mute checkbox. Moving the music
  slider changes the audio engine's music volume and persists it. A
  Reset Save Data button exists.
- **V6 — Bulletin board with objectives.** The bulletin-board modal lists
  pinned objectives. On a fresh game the first objective is
  "Find your way to the end of the maze", not yet completed.
- **V7 — Desk.** The desk modal shows a ledger: current maze layer, full
  runs completed, and items carried.
- **V8 — Shelves hold the compass and map.** The shelf has discrete slots.
  On a fresh game the Compass and Map rest on shelf slots. Walking near an
  item and pressing E picks it up; carried items appear as HUD slot icons.
- **V9 — Sorting items back onto shelves.** While carrying an item, standing
  near an empty shelf slot changes the drop prompt to a "place on the
  shelf" action; pressing Q snaps the item exactly onto that slot's
  coordinates. Picking a shelved item up adds a "Return everything to its
  place on the shelf" objective, which is marked done once every shelvable
  item is back on a slot.
- **V10 — Free drop.** Pressing Q away from any shelf slot places the
  carried item on the floor at the player's position (no snapping).

## Transition

- **V11 — Ladder climbs out of the box.** Near the ladder the prompt offers
  to climb out; pressing E (or I anywhere in the box) plays the
  flatten/unflatten transition (the viewport element has a CSS transform
  transition configured for the flatten effect) and lands the player in the
  maze. The music crossfades from the box track to the maze track.

## The maze

- **V12 — Tile-stepped movement.** The maze is first-person and grid-based:
  a tap of W moves exactly one cell in the facing direction, S exactly one
  cell backward, A/D turn exactly 90° left/right in place (yaw matches the
  new facing). Attempting to step into a wall moves zero cells (bump).
- **V13 — Compass and map overlays.** While the compass is carried and
  active, the compass dial is visible in the maze HUD. While the map is
  carried and active, the minimap is visible and draws explored cells.
  Keys 1 / 2 toggle the compass / minimap respectively.
- **V14 — Talisman-style nested layers.** Reaching the maze exit extends
  the maze outward: layer 1 → 2 → 3, with the world's half-extent growing
  (3 → 7 → 11 cells) and a new "Escape maze layer N" objective added each
  time. Completing layer 3 finishes the run: the run counter increments,
  the maze resets to a fresh layer 1, and objectives reset.
  *Method note: the spec validates this logic-level — it teleports the
  player's logical cell to the exit rather than pathfinding the whole maze,
  because walking three full layers is impractical under headless frame
  throttling. The movement rules themselves are covered by V12.*
- **V15 — Items can be dropped in the maze.** Pressing Q in the maze drops
  the carried item at the player's position, recorded as located in the
  maze; walking near it again offers pickup with E.
- **V16 — I returns to the box.** Pressing I in the maze plays the
  transition back; the player is in the box room again and the box music
  track resumes.

## Audio & persistence

- **V17 — Mute toggle.** Pressing M mutes all audio (master gain 0,
  persisted); pressing M again unmutes.
- **V18 — Persistence and zero errors.** Game state (scene, layer,
  objectives, item locations, carried items) is persisted to localStorage
  under `box-and-bones:save`. No console errors or page errors occurred at
  any point during the entire run.
