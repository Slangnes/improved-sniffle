# Box & Bones

An old-school first-person maze crawler in the spirit of the Windows "3D Maze"
screensaver, with an isometric inventory room inspired by *Talisman*'s
ever-expanding board.

You keep a small wooden box. Climb into it and the world flattens into an
isometric room of its own — shelves, a desk, a corkboard of jobs to do,
posters on the walls. Climb back out and the world unflattens (a proper
dolly-zoom) into a first-person maze. Find the far edge of the maze and it
grows outward, wrapping a bigger ring around the one you just cleared. Clear
three rings and it folds back to the start — a freshly-shuffled maze, ready
to run again.

## Running it

```bash
npm install
npm run dev
```

The game opens already zoomed onto the **title poster** hanging in the box —
there is no separate menu screen. Press **BEGIN** and the camera pulls back
into the isometric room.

Everything readable works the same way: walk up to a poster, the bulletin
board, or the desk and use it, and the camera flies onto the object — the
information is written **on the poster itself**, not in a pop-up. Settings
and key-rebinding live on the actual posters. Posters can be taken off the
wall from their detailed view, carried rolled up, dropped anywhere — even
in the maze — and hung back on any empty hook.

Movement is one square at a time everywhere, like a classic dungeon
crawler (Wizardry, Eye of the Beholder). In the box the overhead camera is
grid-aligned, so **what you press is where you go on screen**: W walks up,
S down, A left, D right, and the little hooded explorer turns to face its
steps; the ladder is the only way out. In the maze it's first-person: W/S
step, A/D strafe, Q/E turn. Held keys chain steps smoothly, the newest
pressed direction wins, and the arrow keys always work (↑↓ step, ←→ turn).

You have a **left hand and a right hand**. Each holds one item; what your
left hand carries sits at the bottom-left of the screen (and in the maze,
floats at that corner of your view), the right at the right. F picks up
into the next free hand (right first); Z drops/shelves/hangs the left
hand's item, C the right's. Tap a held item to inspect it up close.

On touch devices the movement pad, turn buttons, USE, and one DROP button
per hand (each on its own hand's side) appear automatically; a left-handed
setting swaps the pad and action clusters.

## Controls (rebindable in-game via the Controls poster)

| Action                             | Default |
| ----------------------------------- | ------- |
| Step forward / back                 | W S     |
| Strafe left / right                 | A D     |
| Turn left / right                   | Q E     |
| Use / interact                      | F       |
| Left hand: drop, shelve, or hang    | Z       |
| Right hand: drop, shelve, or hang   | C       |
| Look into your box (maze only)      | I       |
| Toggle Compass / Map overlays       | 1 / 2   |
| Arrow keys (always active)          | ↑↓ step, ←→ turn |
| Mute audio                          | M       |

## What's in the box

- **Shelves** with slots to sort your things into — a **Compass** (points
  toward the current exit) and a **Map** (charts everywhere you've walked)
  start out resting there. Stand at an empty slot and press Q to sort a
  carried item back into place.
- A **desk** with a running ledger of your stats.
- A **bulletin board** listing your current objectives.
- **Posters**: the fixed title poster, plus How To Play, Controls, and
  Settings — all readable in detailed view, all but the title removable
  and re-hangable.
- A **ladder** — the diegetic way back out into the maze.

## Validation

`validation.md` is the feature contract; `npm run validate` plays the whole
game through in Playwright against the production build and leaves a
`trace.zip` you can inspect at https://trace.playwright.dev.

## Project layout

```
src/
  core/          input handling + persistent game state (localStorage)
  maze/          maze generation, the first-person dungeon scene, wall/floor textures
  inventory/     the isometric box room scene
  transition/    the in-engine flatten/unflatten scene-swap choreography
  ui/            detailed views, HUD, touch controls, canvas-drawn poster art
```

The maze is not one fixed grid — each "layer" is generated as a ring that
embeds the previous, already-carved layer at its center and carves a fresh
annulus of passages around it, with a single doorway connecting the two.
Walking from the middle of the maze all the way out to layer 3's edge is
walking through the same continuous, ever-growing space.
