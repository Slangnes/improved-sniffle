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

Open the printed local URL and click **Begin**.

In the maze, movement is tile-by-tile like a classic dungeon crawler
(Wizardry, Eye of the Beholder): W/S step forward or back one tile, A/D turn
90&deg; in place. In the box, movement is free-roaming top-down.

On touch devices an on-screen D-pad and USE / DROP / BOX buttons appear
automatically, driving exactly the same actions, and the compass/map HUD
icons can be tapped to toggle those overlays — the game is playable on a
phone at the same URL.

## Controls (rebindable in-game via the Controls poster)

| Action                             | Default |
| ----------------------------------- | ------- |
| Move (box) / Step forward-back (maze) | W S   |
| Strafe (box) / Turn left-right (maze) | A D   |
| Interact                            | E       |
| Drop carried item, or sort it onto an empty shelf slot | Q |
| Look into / climb out of your box   | I       |
| Toggle Compass overlay              | 1       |
| Toggle Map overlay                  | 2       |
| Mute audio                          | M       |

## What's in the box

- **Shelves** with slots to sort your things into — a **Compass** (points
  toward the current exit) and a **Map** (reveals a minimap of everywhere
  you've walked) start out resting there. Carry them off into the maze and
  you'll need to put them back: stand at an empty slot and press Q.
- A **desk** with a running ledger of your stats.
- A **bulletin board** listing your current objectives.
- **Posters** you can walk up to and read: How To Play, Controls, and
  Settings (music/SFX volume, mute, save reset).
- A **ladder** — the diegetic way back out into the maze.

Both the Compass and Map can be picked up and set back down in either the
maze or the box (only the box has the shelf slots); whichever you're
carrying shows up as a HUD overlay.

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
