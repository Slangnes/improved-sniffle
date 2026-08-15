# Box & Bones

An old-school first-person maze crawler in the spirit of the Windows "3D Maze"
screensaver, with a top-down inventory room inspired by *Talisman*'s
ever-expanding board.

You keep a small wooden box. Climb into it and it flattens out into a
diorama-like room of its own — shelves, a desk, a corkboard of jobs to do.
Climb back out and the world unflattens into a first-person maze. Find the
far edge of the maze and it grows outward, wrapping a bigger ring around the
one you just cleared. Clear three rings and it folds back to the start — a
freshly-shuffled maze, ready to run again.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL, click **Begin**, and click the canvas once you're
in the maze to lock the mouse for looking around.

## Controls (rebindable in-game via the Controls poster)

| Action              | Default   |
| -------------------- | --------- |
| Move                 | W A S D   |
| Look around (maze)   | Mouse     |
| Interact             | E         |
| Drop carried item     | Q         |
| Look into / climb out of your box | I |
| Toggle Compass overlay | 1       |
| Toggle Map overlay     | 2       |

## What's in the box

- **Shelves** holding a **Compass** (points toward the current exit) and a
  **Map** (reveals a minimap of everywhere you've walked).
- A **desk** with a running ledger of your stats.
- A **bulletin board** listing your current objectives.
- **Posters** you can walk up to and read: How To Play, Controls, and
  Settings (mouse sensitivity, save reset).
- A **ladder** — the diegetic way back out into the maze.

Both the Compass and Map can be picked up and set back down in either the
maze or the box; whichever you're carrying shows up as a HUD overlay.

## Project layout

```
src/
  core/          input handling + persistent game state (localStorage)
  maze/          maze generation, the first-person dungeon scene, wall/floor textures
  inventory/     the top-down box room scene
  transition/    the flatten/unflatten scene-swap animation
  ui/            modals, HUD, canvas-drawn poster art
```

The maze is not one fixed grid — each "layer" is generated as a ring that
embeds the previous, already-carved layer at its center and carves a fresh
annulus of passages around it, with a single doorway connecting the two.
Walking from the middle of the maze all the way out to layer 3's edge is
walking through the same continuous, ever-growing space.
