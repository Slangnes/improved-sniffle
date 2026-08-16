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

One square at a time, everywhere — and controls always go the way you
expect. The box is presented as a **fixed isometric diorama**: an
orthographic camera frames the whole room from a gentle 30° angle (two
walls visible, floating in the dark) and **never moves while you walk** —
only the little avatar does. Its floor is a fine 11×9 grid of small
tiles, so steps are short and precise. Box movement is absolute: W walks
up the screen (north), S down, A left, D right, and the avatar turns to
face its steps. Because the diorama never rotates there is **no turning
inside the box** — the turn keys (Q/E) and ←/→ step sideways instead of
spinning the avatar in place. The maze is first-person: W/S step along
your view, A/D **strafe**, Q/E **turn** 90°. The **arrow keys always
work** on top of any bindings (↑↓ step; ←→ sidestep in the box, turn in
the maze). Held keys chain steps with no dead frame between them, the
most recently pressed direction wins, and steps have a subtle bob. Tiles
blocked by furniture (or maze walls) refuse the step with a bump.
Climbing into the box always lands you at the foot of the ladder.

## Hands

The player has a **left hand and a right hand**; each holds one item. The
right hand fills first. Each hand's item shows on its own side of the
screen (bottom-left / bottom-right). An awake map or compass works right
there in the hand: the map slot shows the live inked minimap, the compass
slot its live needle. Tapping a held item slides it out of the hand into
the center of the screen for a closer look (and back when dismissed).
Z drops, shelves, or hangs the left hand's item; C the right hand's.
On touch, all the buttons live in a delineated control tray along the
bottom of the screen: the movement pad on one side, the two hand DROP
buttons side by side (L·DROP left, R·DROP right, mirroring the hands)
on the other, and — in the maze — the cardboard box in the middle. The
view area above the tray belongs to the world: the held items float
there at the screen's left and right edges, with the prompt line above
them; context actions have no buttons — the prompt line itself is
tappable and performs the action it names (a smaller hint line beneath
it offers a secondary action, like moving furniture, with its own tap
target). The movement pad is a single crawler rose with the turn buttons
in its top corners (⟲ between ▲ and ◀, ⟳ between ▲ and ▶); the turn
buttons appear **only in the maze** — inside the box there is nothing to
turn, so they vanish and the pad keeps its shape. A left-handed setting
swaps the movement pad and the drop pair between the tray's sides.

## Boot: the title poster

- **V1 — The game boots into a detailed view of the title poster.** No
  separate menu: on load the camera is zoomed onto the "Box & Bones"
  poster in the box with a BEGIN button, rendered on the poster itself
  (dark panel, no modal card). BEGIN is the **only** button — detailed
  views have no × close button at all, and the step-back caption is
  hidden here too. It cannot be dismissed without BEGIN (Escape and
  tapping outside both refuse).
- **V2 — BEGIN zooms out into the diorama.** The camera pulls back from
  the poster and settles at the fixed whole-room framing. Audio starts.
  Inside the box there is **no box at your feet and no shortcut out** —
  the ladder is the only exit. Pressing W steps exactly one tile up the screen
  (north), and the ArrowDown alias steps back.

## The box: info lives on the posters

Interacting (F, or tapping the prompt) with a poster, the bulletin board,
or the desk flies
the camera onto the object; its readable content appears **on the object's
own surface** (the panel is sized to the zoomed poster/board/paper — no
floating modal card). There are **no buttons for leaving**: stepping back
is clicking or tapping anywhere off the object (or Escape) — a faint
caption at the bottom of the screen names the gesture — and the world
prompt line hides while a view is open. Closing flies the camera back
out.

- **V3 — How To Play poster** explains the game, with the words painted
  onto the poster's own texture (the DOM contributes only the take-down
  action); a vignette spotlights the focused object.
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

## Items, the bookshelf, hands

The old wall boards are now a proper **bookshelf**: a wooden case with
side panels, a back, shelf boards, and a row of old books along the
bottom. It has four item slots (two per shelf level), stored by slot
index (`{scene: 'inventory-shelf', slot}`), so everything resting on it
belongs to the case itself.

- **V9 — Compass and map rest in bookshelf slots.** F picks each into the
  next free hand — right first, then left — and each appears in its
  hand's on-screen slot.
- **V10 — Per-hand shelf sorting.** Near an empty slot the prompt names
  the right hand's item first; that hand's key snaps it into the slot
  (recorded by slot index). Once compass and map are both back in slots,
  the tidy objective completes.
- **V11 — Item detailed views.** Tapping a hand's item slides it from the
  hand slot into the center of the screen: the Map draws a large chart of
  explored maze cells, the Compass shows its face — both stay live while
  inspected.
- **V12 — Free drop.** A hand's drop key away from slots and hooks places
  its item on the floor beside the player.

## Transition

- **V13 — The ladder is the way out.** Interacting at the ladder plays the
  in-engine flatten transition (screen dips to black; the maze side
  dolly-zooms between flat telephoto and normal perspective) and lands in
  the first-person maze with the maze music.

## The maze

- **V14 — Steps, strafes, turns, bumps — arrows included.** W/S (and
  ↑/↓) step one cell along the facing, A/D strafe one cell sideways
  without changing facing, Q/E (and ←/→) turn exactly 90°, and stepping
  into a wall moves zero cells.
- **V15 — The held compass and map are live in the hands.** While awake,
  the map's hand slot shows the inked minimap and the compass slot its
  needle; keys 1 / 2 stow each back to a plain glyph and wake it again.
- **V16 — Talisman-style nested layers; nothing is ever lost.** Exit
  extends the maze 1 → 2 → 3 (half-extent 3 → 7 → 11), then a completed
  run resets to a fresh layer 1 and increments the run counter. Anything
  left lying in the maze when it reshapes (an item dropped in an outer
  ring, say the compass) **finds its way back to the box** — returned to
  a free bookshelf slot or wall hook rather than vanishing with the old
  corridors. *(Validated logic-level by teleporting the logical cell to
  the exit.)*
- **V17 — Per-hand drops in the maze.** A hand's key drops its item at the
  player (posters lie as scrolls); F picks back up into a free hand.
- **V18 — I returns to the box** (from the maze only), with the box music.
  The cardboard box also sits at the player's feet, bottom-center of the
  maze view; clicking or tapping it is the same look inside.

## Audio & persistence

- **V19 — Mute toggle.** M mutes (master gain 0, persisted) and unmutes.
- **V20 — Persistence and zero errors.** Scene, layer, objectives, item
  locations (incl. poster hooks and bookshelf slots), **both hands**, and
  **furniture positions** persist under `box-and-bones:save`. No console
  or page errors occurred all run.

## Touch

- **V21 — Touch controls drive both scenes.** The D-pad steps and
  strafes; the corner ⟲ ⟳ turn buttons are hidden inside the box (there
  is nothing to turn) and appear in the maze, where ⟲ turns 90°. Tapping
  the prompt line performs the action it names (including climbing the
  ladder — the box at your feet exists only in the maze), and holding ▲
  in the maze steps one cell. Buttons route through current bindings.

## Movable furniture

- **V22 — The bookshelf and desk can be carried.** Standing beside a
  piece of furniture, the prompt (or its hint line) offers the grab key
  (G): press it and the piece lifts and moves with your steps, one tile
  at a time — everything in its slots rides along, still recorded by
  slot index. A step that would push it out of the room, onto other
  furniture, onto something lying on the floor, or onto the tile at the
  ladder's foot is refused with a bump. Pressing grab again sets it
  down on the grid, and the new position persists in the save.
