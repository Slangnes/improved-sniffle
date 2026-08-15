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
board, or the desk and interact, and the camera flies into a **detailed
view** of it — settings and key-rebinding live on the actual posters.
Carried items (the map, the compass, a rolled-up poster) open their own
detailed views from their HUD icons. Posters can even be taken off the wall
from inside their detailed view, carried rolled up, dropped anywhere — even
in the maze — and hung back on any empty hook.

In the maze, movement is tile-by-tile like a classic dungeon crawler
(Wizardry, Eye of the Beholder): W/S step forward or back one tile, A/D turn
90&deg; in place. In the box, movement is free-roaming and screen-relative.

On touch devices an on-screen D-pad and USE / DROP / BOX buttons appear
automatically, driving exactly the same actions, and carried-item HUD icons
can be tapped to inspect them — the game is playable on a phone at the same
URL.

## Controls (rebindable in-game via the Controls poster)

| Action                             | Default |
| ----------------------------------- | ------- |
| Move (box) / Step forward-back (maze) | W S   |
| Strafe (box) / Turn left-right (maze) | A D   |
| Interact / open detailed view       | E       |
| Drop, shelf, or hang the carried item | Q     |
| Look into / climb out of your box   | I       |
| Toggle Compass overlay              | 1       |
| Toggle Map overlay                  | 2       |
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
