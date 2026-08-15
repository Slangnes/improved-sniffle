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
the trace, with screenshots of the actual gameplay.

The entire spec runs in a touch-capable browser context (`hasTouch: true`),
so the touch UI is visible in every screenshot; V21 exercises it directly.
Console errors are collected for the whole run; V20 fails if any occurred.

---

## Boot: the title poster

- **V1 — The game boots into a detailed view of the title poster.** There is
  no separate menu screen: on load the camera is already zoomed onto the
  "Box & Bones" poster hanging in the box, with its readable panel open and
  a BEGIN button. The view cannot be dismissed without pressing BEGIN.
- **V2 — BEGIN zooms out into the box.** Pressing BEGIN closes the panel and
  the camera pulls back from the poster into the game's normal view of the
  box: an **isometric, orthographic** overhead view of the room, with the
  player avatar visible. Audio starts (context running, music-box track).

## The box: detailed views

Interacting (E / USE) with anything readable in the box does not pop a menu
— the camera physically flies up to the object, then its readable panel
fades in over it ("detailed view"). Closing it flies the camera back out to
the isometric follow view. In the box, movement is free-roaming and
screen-relative (up walks toward the top of the screen).

- **V3 — How To Play poster.** Near the poster the prompt names it; USE
  zooms into the poster and opens its panel explaining the game. Escape
  closes it and returns the camera to the follow view.
- **V4 — Controls poster with live rebinding.** The Controls detail lists
  every action with its current key. Clicking a binding then pressing a new
  key rebinds it (persisted to localStorage); rebinding back restores it.
- **V5 — Settings poster.** Music Volume and Sound Effects Volume sliders,
  a Mute checkbox, and a Reset Save Data button. Moving the music slider
  changes the audio engine's volume and persists it.
- **V6 — Bulletin board.** Lists pinned objectives; on a fresh game the
  first is "Find your way to the end of the maze", not completed.
- **V7 — Desk.** A ledger: current maze layer, full runs completed, items
  carried.

## Movable posters

- **V8 — Posters come off the wall.** A poster's detailed view has a
  "Take it off the wall" button: pressing it closes the view with the
  poster now carried (rolled up). Dropping it away from the wall lays a
  rolled scroll on the floor; picking it back up and standing at an empty
  wall hook turns the drop prompt into a "hang" action that puts it back
  on the wall. (The title poster is fixed and cannot be removed.)

## Items & shelves

- **V9 — Shelves hold the compass and map.** On a fresh game both rest on
  shelf slots; USE picks them up and carried items appear as HUD icons.
- **V10 — Sorting items back onto shelves.** Carrying items, standing near
  an empty shelf slot changes the drop prompt to a "place on the shelf"
  action for the most recently picked-up item; Q snaps it onto the slot.
  Taking shelf items adds a "Return everything to its place on the shelf"
  objective, marked done once compass and map are both back on slots.
- **V11 — Item detailed views.** Tapping a carried item's HUD icon opens
  its detailed view: the Map shows a large hand-drawn chart of every maze
  cell explored so far; the Compass shows its face up close. These work in
  both scenes.
- **V12 — Free drop.** Q away from shelves and hooks places the most
  recently picked-up carried item on the floor at the player's position.

## Transition

- **V13 — Climbing out flattens the world.** At the ladder, USE plays the
  in-engine transition: the screen dips to black while the outgoing view
  animates (the box camera dives onto the player; in the other direction
  the maze dolly-zooms to a flattened telephoto crush), then the incoming
  scene animates out to its natural framing. The player lands in the
  first-person maze with its camera restored to the normal field of view,
  and the music crossfades to the maze track.

## The maze

- **V14 — Tile-stepped movement.** First-person and grid-based: W steps
  exactly one cell along the facing, S one cell back, A/D turn exactly 90°
  in place. Stepping into a wall moves zero cells (bump).
- **V15 — Compass and map overlays.** While carried and active, the compass
  dial and minimap are visible in the maze HUD; keys 1 / 2 toggle them.
- **V16 — Talisman-style nested layers.** Reaching the exit extends the
  maze outward: layer 1 → 2 → 3 (half-extent 3 → 7 → 11) with an
  "Escape maze layer N" objective each time; completing layer 3 increments
  the run counter and resets to a fresh layer 1.
  *Method note: validated logic-level by teleporting the player's logical
  cell to the exit; the movement rules themselves are covered by V14.*
- **V17 — Items can be dropped in the maze.** Q drops the most recent
  carried item at the player's position (posters lie as rolled scrolls);
  walking near it offers pickup with USE.
- **V18 — I returns to the box.** The reverse transition plays and the box
  music resumes in the isometric view.

## Audio & persistence

- **V19 — Mute toggle.** M mutes all audio (master gain 0, persisted);
  M again unmutes.
- **V20 — Persistence and zero errors.** Game state (scene, layer,
  objectives, item locations incl. poster wall positions, carried items)
  persists to localStorage under `box-and-bones:save`. No console or page
  errors occurred during the entire run.

## Touch

- **V21 — Touch controls drive both scenes.** On a touch screen an
  on-screen D-pad and USE / DROP / BOX buttons appear. Holding the D-pad
  walks the player in the box; BOX climbs out through the transition;
  holding ▲ in the maze steps one cell and ◀ turns 90°. Buttons route
  through the current key bindings, so rebinding re-routes touch too.
