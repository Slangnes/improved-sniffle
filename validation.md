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

## Movement language (both scenes)

One square at a time, everywhere. W/S step forward/back, A/D **strafe**
left/right, Q/E **turn** 90° in place. The box is a walkable grid inside
an isometric orthographic view; the maze is first-person 3D. Tiles blocked
by furniture (or maze walls) refuse the step with a bump.

## Hands

The player has a **left hand and a right hand**; each holds one item. The
right hand fills first. Each hand's item shows on its own side of the
screen (bottom-left / bottom-right) and is tapped to inspect. Z drops,
shelves, or hangs the left hand's item; C the right hand's. On touch, each
hand has its own DROP button on its own side of the screen, and a
left-handed setting swaps the movement pad and the turn/use cluster
between sides (the hand buttons stay on their hands' sides).

## Boot: the title poster

- **V1 — The game boots into a detailed view of the title poster.** No
  separate menu: on load the camera is zoomed onto the "Box & Bones"
  poster in the box with a BEGIN button, rendered on the poster itself
  (dark panel, no modal card). It cannot be dismissed without BEGIN.
- **V2 — BEGIN zooms out into the isometric box.** The camera pulls back
  from the poster into the orthographic isometric view. Audio starts.
  Inside the box there is **no BOX button and no shortcut out** — the
  touch BOX button is hidden; the ladder is the only exit.

## The box: info lives on the posters

Interacting (F / USE) with a poster, the bulletin board, or the desk flies
the camera onto the object; its readable content appears **on the object's
own surface** (the panel is sized to the zoomed poster/board/paper — no
floating modal card). Closing flies the camera back out.

- **V3 — How To Play poster** explains the game, on the poster.
- **V4 — Controls poster** lists every action with its key; clicking a
  binding then pressing a new key rebinds it live (persisted).
- **V5 — Settings poster** has Music/SFX volume sliders, a Mute checkbox,
  a Left-Handed Touch Layout checkbox, and Reset Save Data.
- **V6 — Bulletin board** lists objectives; first is "Find your way to the
  end of the maze".
- **V7 — Desk** shows the ledger on the paper lying on it.

## Movable posters

- **V8 — Posters come off the wall.** "Take it off the wall" in a poster's
  detailed view puts it (rolled up) in a free hand. The hand's drop key
  lays it on the floor as a scroll; picking it back up and standing at an
  empty hook turns that hand's drop into a "hang" action. The title poster
  is fixed.

## Items, shelves, hands

- **V9 — Compass and map rest on shelf slots.** F picks each into the next
  free hand — right first, then left — and each appears in its hand's
  on-screen slot.
- **V10 — Per-hand shelf sorting.** Near an empty slot the prompt names
  the right hand's item first; that hand's key snaps it onto the slot.
  Once compass and map are both back on slots, the tidy objective
  completes.
- **V11 — Item detailed views.** Tapping a hand's item opens it up close:
  the Map draws a large chart of explored maze cells, the Compass shows
  its face.
- **V12 — Free drop.** A hand's drop key away from slots and hooks places
  its item on the floor beside the player.

## Transition

- **V13 — The ladder is the way out.** USE at the ladder plays the
  in-engine flatten transition (screen dips to black; the maze side
  dolly-zooms between flat telephoto and normal perspective) and lands in
  the first-person maze with the maze music.

## The maze

- **V14 — Steps, strafes, turns, bumps.** W/S step one cell along the
  facing, A/D strafe one cell sideways without changing facing, Q/E turn
  exactly 90°, and stepping into a wall moves zero cells.
- **V15 — Compass and map overlays** show while carried and active; keys
  1 / 2 toggle them.
- **V16 — Talisman-style nested layers.** Exit extends the maze 1 → 2 → 3
  (half-extent 3 → 7 → 11), then a completed run resets to a fresh
  layer 1 and increments the run counter. *(Validated logic-level by
  teleporting the logical cell to the exit.)*
- **V17 — Per-hand drops in the maze.** A hand's key drops its item at the
  player (posters lie as scrolls); F picks back up into a free hand.
- **V18 — I returns to the box** (from the maze only), with the box music.

## Audio & persistence

- **V19 — Mute toggle.** M mutes (master gain 0, persisted) and unmutes.
- **V20 — Persistence and zero errors.** Scene, layer, objectives, item
  locations (incl. poster hooks), and **both hands** persist under
  `box-and-bones:save`. No console or page errors occurred all run.

## Touch

- **V21 — Touch controls drive both scenes.** The D-pad steps and strafes,
  the ⟲ button turns, USE interacts (including climbing the ladder — the
  BOX button exists only in the maze), and holding ▲ in the maze steps one
  cell. Buttons route through current bindings.
