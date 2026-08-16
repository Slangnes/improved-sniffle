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
information is written **on the poster itself**, not in a pop-up, and
there is no close button: step back by clicking or tapping anywhere off
the object (or Esc). Settings
and key-rebinding live on the actual posters. Posters can be taken off the
wall from their detailed view, carried rolled up, dropped anywhere — even
in the maze — and hung back on any empty hook.

Movement is one square at a time everywhere, like a classic dungeon
crawler (Wizardry, Eye of the Beholder). The box is a fixed isometric
diorama — the camera frames the whole room and never moves while you
walk — with a fine grid of small floor tiles, so steps are short and
precise. **What you press is where you go**: W walks up the screen, S
down, A left, D right, and the little hooded explorer turns to face its
steps. Because the diorama never rotates there is no turning inside the
box — with empty arms Q/E and the ←/→ arrows step sideways too, and
while carrying furniture they rotate the carried piece instead (the
on-screen ⟲⟳ buttons appear in the maze and, in the box, only while
carrying). The ladder is the only way out, and
climbing back in lands you at its foot. In the maze it's first-person:
W/S step, A/D strafe, Q/E turn. Held keys chain steps smoothly, the
newest pressed direction wins, and the arrow keys always work (↑↓ step;
←→ sidestep in the box, turn in the maze).

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
| Turn left / right (maze) — in the box: sidestep, or rotate carried furniture | Q E |
| Use / interact                      | F       |
| Grab / move furniture (in the box)  | G       |
| Left hand: drop, shelve, or hang    | Z       |
| Right hand: drop, shelve, or hang   | C       |
| Look into your box (maze only)      | I       |
| Toggle Compass / Map overlays       | 1 / 2   |
| Arrow keys (always active)          | ↑↓ step; ←→ sidestep (box) / turn (maze) |
| Mute audio                          | M       |

## What's in the box

- A **bookshelf** — a proper wooden case with a row of old books along
  the bottom and item slots on its two middle shelves. A **Compass**
  (points toward the current exit) and a **Map** (charts everywhere
  you've walked) start out resting there. It has its own detailed view:
  use it (F) and the camera flies to face the open shelves, where
  tapping a listed item takes it into a free hand. Stand at an empty
  slot and a hand's drop key (Z / C) sorts that hand's item back into
  place.
- A **desk** — drawer pedestals, an inkwell, a resting quill — with a
  running ledger of your stats (maze layer, runs, steps walked, what
  you're carrying).
- Both the bookshelf and the desk are **movable**: stand beside one,
  press G to pick it up, walk it anywhere on the grid (everything on its
  shelves rides along), rotate it a quarter-turn at a time with Q/E or
  ←/→ while carrying, and press G again to set it down. It can't be
  parked on the ladder's tile, on other furniture, or on anything lying
  on the floor.
- **Nothing is ever lost**: anything left lying in the maze when it
  reshapes at the end of a run finds its way back to the box on its own.
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
