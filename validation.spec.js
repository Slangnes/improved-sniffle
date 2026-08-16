// Validation suite for Box & Bones.
//
// This file is generated from, and mirrors, `validation.md` — every V-number
// below is a named test.step matching an assertion in that document, in the
// same order. Run via `npm run validate`, which builds the production bundle,
// runs this spec against `vite preview` with tracing on, and copies the
// resulting trace to ./trace.zip for inspection.
//
// The game exposes `window.__box` for instrumentation. Headless rendering
// throttles requestAnimationFrame and the game clamps dt per frame, so all
// waits poll game state with generous timeouts.

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = 'http://localhost:4173/';

test.use({
  viewport: { width: 1280, height: 800 },
  hasTouch: true,
  trace: { mode: 'on', screenshots: true, snapshots: false, sources: true },
  launchOptions: process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
});

let server;

test.beforeAll(async () => {
  if (!existsSync(new URL('./dist/index.html', import.meta.url))) {
    throw new Error('dist/ not found — run `npm run build` first (or use `npm run validate`).');
  }
  server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch (e) {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite preview did not start on :4173');
});

test.afterAll(() => {
  server?.kill();
});

// ---------- box grid navigation ----------

const boxTile = (page) =>
  page.evaluate(() => ({
    col: window.__box.inventoryScene.col,
    row: window.__box.inventoryScene.row,
    facing: window.__box.inventoryScene.facing,
  }));

// Hold a movement key until the tile changes (or timeout), then wait for the
// step tween. Returns whether the tile changed.
async function boxStep(page, key, maxHoldMs = 2500) {
  await page.evaluate(() => {
    const s = window.__box.inventoryScene;
    s.__c = s.col;
    s.__r = s.row;
  });
  await page.keyboard.down(key);
  const start = Date.now();
  let changed = false;
  while (Date.now() - start < maxHoldMs) {
    changed = await page.evaluate(() => {
      const s = window.__box.inventoryScene;
      return s.col !== s.__c || s.row !== s.__r;
    });
    if (changed) break;
    await page.waitForTimeout(25);
  }
  await page.keyboard.up(key);
  await page.waitForFunction(() => !window.__box.inventoryScene.isAnimating);
  return changed;
}

// Walk a straight-line path of waypoints; each waypoint must share an axis
// with the previous position. Box movement is screen-absolute: W north,
// D east, S south, A west, regardless of the avatar's facing.
async function navigate(page, waypoints) {
  for (const [col, row] of waypoints) {
    for (let guard = 0; guard < 30; guard++) {
      const t = await boxTile(page);
      if (t.col === col && t.row === row) break;
      let key;
      if (t.col < col) key = 'd';
      else if (t.col > col) key = 'a';
      else if (t.row < row) key = 's';
      else key = 'w';
      const moved = await boxStep(page, key);
      if (!moved) throw new Error(`blocked stepping ${key} at ${t.col},${t.row}`);
    }
    const t = await boxTile(page);
    if (t.col !== col || t.row !== row) throw new Error(`failed to reach ${col},${row}`);
  }
}

async function openDetail(page) {
  await page.keyboard.press('f');
  await expect(page.locator('#modal-layer')).toBeVisible({ timeout: 20000 });
}

async function closeDetail(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
}

const boxPrompt = (page) => page.evaluate(() => window.__box.inventoryScene.prompt);

// ---------- maze helpers ----------

const mazeCell = (page) =>
  page.evaluate(() => ({
    x: window.__box.mazeScene.cellX,
    y: window.__box.mazeScene.cellY,
    facing: window.__box.mazeScene.facing,
  }));

const markMaze = (page) =>
  page.evaluate(() => {
    const m = window.__box.mazeScene;
    m.__vStartX = m.cellX;
    m.__vStartY = m.cellY;
    m.__vFacing = m.facing;
  });
const mazeCellChanged = () => {
  const m = window.__box.mazeScene;
  return m.cellX !== m.__vStartX || m.cellY !== m.__vStartY;
};
const mazeFacingChanged = () =>
  window.__box.mazeScene.facing !== window.__box.mazeScene.__vFacing;

async function mazeAction(page, key, changed, maxHoldMs = 2000) {
  await page.keyboard.down(key);
  const start = Date.now();
  let didChange = false;
  while (Date.now() - start < maxHoldMs) {
    if (await page.evaluate(changed)) {
      didChange = true;
      break;
    }
    await page.waitForTimeout(25);
  }
  await page.keyboard.up(key);
  await page.waitForFunction(() => !window.__box.mazeScene.isAnimating);
  return didChange;
}

test('validation.md contract', async ({ page }) => {
  test.setTimeout(600000);

  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await test.step('V1: boots into the title poster, info on the poster itself', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expect(page.locator('#modal-layer')).toBeVisible();
    await expect(page.locator('#detail-begin')).toBeVisible();
    // BEGIN is the only button: there is no × close control at all, and
    // the unstarted title hides the step-back caption too.
    await expect(page.locator('#modal-close')).toHaveCount(0);
    await expect(page.locator('#modal-dismiss-hint')).toBeHidden();
    // Tapping outside refuses to dismiss the unstarted title.
    await page.mouse.click(80, 400);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__box.detailView.isOpen())).toBe(true);
    // No modal card: the panel is sized to the poster (world panel, dark ink).
    await expect(page.locator('#modal-box')).toHaveClass(/panel-world/);
    await expect(page.locator('#modal-box')).toHaveClass(/panel-dark/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__box.detailView.isOpen())).toBe(true);
  });

  await test.step('V2: BEGIN zooms out; ladder is the only exit (no BOX button)', async () => {
    await page.click('#detail-begin');
    await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
    expect(await page.evaluate(() => window.__box.gameState.scene)).toBe('inventory');
    const cam = await page.evaluate(() => ({
      ortho: window.__box.inventoryScene.camera.isOrthographicCamera,
      zoom: window.__box.inventoryScene.camera.zoom,
      roomZoom: window.__box.inventoryScene.roomZoom,
      ctxState: window.__box.audio.ctx?.state,
      track: window.__box.audio._currentTrack,
    }));
    expect(cam.ortho).toBe(true);
    // Fixed diorama framing: the camera rests at the whole-room zoom.
    expect(Math.abs(cam.zoom - cam.roomZoom)).toBeLessThan(0.05);
    expect(cam.ctxState).toBe('running');
    expect(cam.track).toBe('box');
    await expect(page.locator('#box-entry')).toBeHidden();

    // Screen-aligned movement: W steps one tile north (up on screen).
    const t0 = await boxTile(page);
    expect(await boxStep(page, 'w')).toBe(true);
    const t1 = await boxTile(page);
    expect(t1.row).toBe(t0.row - 1);
    expect(t1.col).toBe(t0.col);
    // The arrow keys always work: ArrowDown steps back south.
    expect(await boxStep(page, 'ArrowDown')).toBe(true);
    const t2 = await boxTile(page);
    expect({ col: t2.col, row: t2.row }).toEqual({ col: t0.col, row: t0.row });
  });

  await test.step('V3: How To Play poster, read on the poster', async () => {
    await navigate(page, [[2, 4], [2, 0]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('How To Play poster');
    await openDetail(page);
    // The world prompt hides while a detailed view is open; the faint
    // caption names the step-back gesture (there is no close button).
    await expect(page.locator('#prompt')).toBeHidden();
    await expect(page.locator('#modal-dismiss-hint')).toBeVisible();
    await expect(page.locator('#modal-box')).toHaveClass(/panel-world/);
    // The poster's words are painted on the poster texture itself; the DOM
    // contributes only the take-down action.
    expect(await page.evaluate(() => window.__box.detailView.currentId)).toBe('poster-howto');
    await expect(page.locator('button[data-take-down="poster-howto"]')).toBeVisible();
    // Stepping back is a click anywhere off the poster.
    await page.mouse.click(80, 400);
    await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
    expect(await page.evaluate(() => window.__box.inventoryScene.cameraOverride)).toBe(false);
  });

  await test.step('V4: Controls poster rebinds keys live on an opaque panel', async () => {
    await navigate(page, [[4, 0]]);
    await openDetail(page);
    // Live DOM content needs an opaque surface: the rendered poster under
    // the panel must not bleed its painted words through the binding list.
    await expect(page.locator('#modal-box')).toHaveClass(/interactive/);
    const bg = await page
      .locator('#modal-box')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    // The take-down action flows below the last binding row rather than
    // floating over mid-list rows in the fixed-size poster panel.
    await page.evaluate(() => {
      const c = document.getElementById('modal-content');
      c.scrollTop = c.scrollHeight;
    });
    const lastRow = page.locator('.keybind-row').last();
    const footerBtn = page.locator('button[data-take-down="poster-controls"]');
    await expect(footerBtn).toBeVisible();
    const lastBox = await lastRow.boundingBox();
    const footBox = await footerBtn.boundingBox();
    expect(footBox.y).toBeGreaterThanOrEqual(lastBox.y + lastBox.height - 1);
    const row = page.locator('.keybind-row', { hasText: 'Left Hand: Drop / Place' });
    await expect(row.locator('button.rebind')).toHaveText('Z');
    await row.locator('button.rebind').click();
    await page.keyboard.press('p');
    await expect(row.locator('button.rebind')).toHaveText('P');
    expect(await page.evaluate(() => window.__box.input.bindings.dropLeft)).toBe('KeyP');
    await row.locator('button.rebind').click();
    await page.keyboard.press('z');
    await expect(row.locator('button.rebind')).toHaveText('Z');
    await closeDetail(page);
  });

  await test.step('V5: Settings poster: volumes, mute, left-handed layout', async () => {
    await navigate(page, [[6, 0]]);
    await openDetail(page);
    await expect(page.locator('#modal-box')).toHaveClass(/interactive/);
    const musicRow = page.locator('.keybind-row', { hasText: 'Music Volume' });
    await expect(musicRow.locator('input[type=range]')).toBeVisible();
    await expect(
      page.locator('.keybind-row', { hasText: 'Sound Effects Volume' }).locator('input[type=range]')
    ).toBeVisible();
    await expect(
      page.locator('.keybind-row', { hasText: 'Mute All Audio' }).locator('input[type=checkbox]')
    ).toBeVisible();
    await expect(
      page.locator('.keybind-row', { hasText: 'Left-Handed Touch Layout' }).locator('input[type=checkbox]')
    ).toBeVisible();
    await expect(page.locator('#modal-content button.rebind', { hasText: 'Reset Save Data' })).toBeVisible();
    await musicRow.locator('input[type=range]').evaluate((el) => {
      el.value = '0.2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(await page.evaluate(() => window.__box.audio.musicVolume)).toBe(0.2);
    await closeDetail(page);
  });

  await test.step('V6: bulletin board shows the starting objective', async () => {
    await navigate(page, [[10, 0]]);
    await openDetail(page);
    await expect(page.locator('#modal-box')).toHaveClass(/interactive/);
    await expect(page.locator('#modal-content')).toContainText('Find your way to the end of the maze');
    await closeDetail(page);
  });

  await test.step('V7: desk shows the ledger on its paper', async () => {
    await navigate(page, [[8, 6]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('Desk');
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Current maze layer');
    await expect(page.locator('#modal-content')).toContainText('Steps walked');
    await expect(page.locator('#modal-box')).toHaveClass(/panel-paper/);
    await closeDetail(page);
  });

  await test.step('V8: posters come off the wall into a hand, drop as scrolls, re-hang', async () => {
    await navigate(page, [[2, 0]]);
    await openDetail(page);
    await page.locator('button[data-take-down="poster-howto"]').click();
    await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
    expect(await page.evaluate(() => window.__box.gameState.hands.right)).toBe('poster-howto');

    await navigate(page, [[3, 0], [3, 2]]);
    await page.keyboard.press('c');
    const dropped = await page.evaluate(() => window.__box.gameState.itemLocations['poster-howto']);
    expect(dropped.scene).toBe('inventory');
    const tile = await boxTile(page);
    expect(Math.hypot(dropped.x - (-5 + tile.col), dropped.z - (-4 + tile.row))).toBeLessThan(0.6);

    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('pick up the How To Play poster');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.right)).toBe('poster-howto');

    await navigate(page, [[2, 2], [2, 0]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('hang the How To Play poster');
    await page.keyboard.press('c');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations['poster-howto']))
      .toEqual({ scene: 'inventory-wall', anchor: 0 });
  });

  await test.step('V9: the bookshelf has a detailed view; items are taken from it', async () => {
    await navigate(page, [[1, 5]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('look at the Bookshelf');
    await openDetail(page);
    expect(await page.evaluate(() => window.__box.detailView.currentId)).toBe('bookshelf');
    // The real 3D shelves stay visible: a translucent listing, no card.
    await expect(page.locator('#modal-box')).toHaveClass(/panel-shelf/);
    await page.locator('button[data-take="compass"]').click();
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.right)).toBe('compass');
    await page.locator('button[data-take="map"]').click();
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.left)).toBe('map');
    await closeDetail(page);
    await expect(page.locator('#hand-right')).toHaveAttribute('data-item', 'compass');
    await expect(page.locator('#hand-left')).toHaveAttribute('data-item', 'map');
  });

  await test.step('V10: per-hand shelf sorting completes the tidy objective', async () => {
    await navigate(page, [[1, 4]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('place the Compass on the shelf');
    await page.keyboard.press('c');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.compass))
      .toEqual({ scene: 'inventory-shelf', slot: 0 });
    let tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy.done).toBe(false); // map still in the left hand
    await navigate(page, [[1, 6]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('place the Map on the shelf');
    await page.keyboard.press('z');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.map))
      .toEqual({ scene: 'inventory-shelf', slot: 1 });
    tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy.done).toBe(true);
    // take both back from the bookshelf's view for the maze half of the run
    await navigate(page, [[1, 5]]);
    await openDetail(page);
    await page.locator('button[data-take="map"]').click(); // -> right hand
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.right)).toBe('map');
    await page.locator('button[data-take="compass"]').click(); // -> left hand
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.left)).toBe('compass');
    await closeDetail(page);
    expect(await page.evaluate(() => window.__box.gameState.hands)).toEqual({
      right: 'map',
      left: 'compass',
    });
  });

  await test.step('V11: hand items open their detailed views', async () => {
    await page.locator('#hand-right').click();
    await expect(page.locator('#modal-layer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#modal-content')).toContainText('Map');
    await expect(page.locator('#modal-content canvas')).toBeVisible();
    await expect(page.locator('#modal-box')).toHaveClass(/panel-item/);
    await closeDetail(page);
    await page.locator('#hand-left').click();
    await expect(page.locator('#modal-layer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#modal-content')).toContainText('Compass');
    await closeDetail(page);
  });

  await test.step('V12: a hand key free-drops its item beside the player', async () => {
    await navigate(page, [[3, 4]]);
    await page.keyboard.press('z'); // left hand: compass
    const loc = await page.evaluate(() => window.__box.gameState.itemLocations.compass);
    expect(loc.scene).toBe('inventory');
    const t = await boxTile(page);
    expect(Math.hypot(loc.x - (-5 + t.col), loc.z - (-4 + t.row))).toBeLessThan(0.6);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('pick up the Compass');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.left)).toBe('compass');
  });

  await test.step('V13: USE at the ladder flattens out into the maze', async () => {
    await page.evaluate(() => {
      window.__sawFade = false;
      const el = document.getElementById('fade-overlay');
      new MutationObserver(() => {
        if (el.classList.contains('active')) window.__sawFade = true;
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    await navigate(page, [[5, 7]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('climb out');
    await page.keyboard.press('f');
    await page.waitForFunction(
      () =>
        window.__box.gameState.scene === 'maze' &&
        !window.__box.transition.playing &&
        Math.abs(window.__box.mazeScene.camera.fov - 72) < 0.5,
      null,
      { timeout: 30000 }
    );
    expect(await page.evaluate(() => window.__sawFade)).toBe(true);
    expect(await page.evaluate(() => window.__box.audio._currentTrack)).toBe('maze');
    await expect(page.locator('#box-entry')).toBeVisible();
  });

  await test.step('V14: maze steps, strafes, turns, bumps — arrows also work', async () => {
    // Step forward exactly one cell (via the always-on ArrowUp alias).
    await markMaze(page);
    const before = await mazeCell(page);
    expect(await mazeAction(page, 'ArrowUp', mazeCellChanged)).toBe(true);
    const after = await mazeCell(page);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
    expect(after.facing).toBe(before.facing);

    // Step back to where we were.
    await markMaze(page);
    expect(await mazeAction(page, 's', mazeCellChanged)).toBe(true);
    expect(await mazeCell(page)).toEqual(before);

    // Turns rotate 90° in place (Q left / ArrowLeft, E right).
    await markMaze(page);
    expect(await mazeAction(page, 'ArrowLeft', mazeFacingChanged)).toBe(true);
    const turned = await mazeCell(page);
    expect(turned.facing).toBe((before.facing + 3) % 4);
    expect({ x: turned.x, y: turned.y }).toEqual({ x: before.x, y: before.y });
    await markMaze(page);
    expect(await mazeAction(page, 'e', mazeFacingChanged)).toBe(true);
    expect((await mazeCell(page)).facing).toBe(before.facing);

    // Strafe: find an open side within a few forward steps, sidestep
    // without changing facing.
    let strafed = false;
    for (let i = 0; i < 4 && !strafed; i++) {
      const sides = await page.evaluate(() => {
        const m = window.__box.mazeScene;
        const cell = m.world.cellAt(m.cellX, m.cellY);
        const walls = ['N', 'E', 'S', 'W'];
        return {
          left: !cell[walls[(m.facing + 3) % 4]],
          right: !cell[walls[(m.facing + 1) % 4]],
        };
      });
      const key = sides.left ? 'a' : sides.right ? 'd' : null;
      if (key) {
        const f0 = (await mazeCell(page)).facing;
        await markMaze(page);
        expect(await mazeAction(page, key, mazeCellChanged)).toBe(true);
        expect((await mazeCell(page)).facing).toBe(f0);
        strafed = true;
      } else {
        await markMaze(page);
        await mazeAction(page, 'w', mazeCellChanged);
      }
    }
    expect(strafed).toBe(true);

    // Bump: face a walled direction, step must not move.
    const walledFacing = await page.evaluate(() => {
      const m = window.__box.mazeScene;
      const cell = m.world.cellAt(m.cellX, m.cellY);
      return ['N', 'E', 'S', 'W'].findIndex((w) => cell[w]);
    });
    expect(walledFacing).toBeGreaterThanOrEqual(0);
    while ((await mazeCell(page)).facing !== walledFacing) {
      await markMaze(page);
      expect(await mazeAction(page, 'e', mazeFacingChanged)).toBe(true);
    }
    await markMaze(page);
    const beforeBump = await mazeCell(page);
    expect(await mazeAction(page, 'w', mazeCellChanged, 800)).toBe(false);
    const afterBump = await mazeCell(page);
    expect({ x: afterBump.x, y: afterBump.y }).toEqual({ x: beforeBump.x, y: beforeBump.y });
  });

  await test.step('V15: held compass and map are live in the hands; 1/2 stow and wake', async () => {
    const mapFace = page.locator('.hand-slot[data-item="map"] .hand-minimap');
    const compassFace = page.locator('.hand-slot[data-item="compass"] .hand-dial');
    await expect(mapFace).toBeVisible();
    await expect(compassFace).toBeVisible();
    await page.keyboard.press('2');
    await expect(mapFace).toBeHidden();
    await page.keyboard.press('2');
    await expect(mapFace).toBeVisible();
    await page.keyboard.press('1');
    await expect(compassFace).toBeHidden();
    await page.keyboard.press('1');
    await expect(compassFace).toBeVisible();
  });

  await test.step('V16: exits nest new layers, then a run resets', async () => {
    const teleportToExit = () =>
      page.evaluate(() => {
        const m = window.__box.mazeScene;
        m.cellX = m.world.exit.x;
        m.cellY = m.world.exit.y;
        const pos = m.world.worldPos(m.cellX, m.cellY);
        m.playerX = pos.x;
        m.playerZ = pos.z;
      });

    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(3);
    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.mazeLayer === 2, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(7);
    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.mazeLayer === 3, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(11);
    // Leave the compass lying in the outer ring: reshaping the maze would
    // orphan it, so completing the run must bring it back to the box.
    await page.keyboard.press('z'); // left hand: compass
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.compass?.scene))
      .toBe('maze');
    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.runsCompleted === 1, null, {
      timeout: 10000,
    });
    expect(await page.evaluate(() => window.__box.gameState.mazeLayer)).toBe(1);
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(3);
    expect(await page.evaluate(() => window.__box.gameState.itemLocations.compass)).toEqual({
      scene: 'inventory-shelf',
      slot: 0,
    });
    expect(await page.evaluate(() => window.__box.gameState.hands.left)).toBe(null);
  });

  await test.step('V17: per-hand drops work in the maze', async () => {
    await page.keyboard.press('c'); // right hand: the map
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.map?.scene))
      .toBe('maze');
    await expect
      .poll(() => page.evaluate(() => window.__box.mazeScene.prompt), { timeout: 10000 })
      .toContain('pick up the Map');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.right)).toBe('map');
  });

  await test.step('V18: I climbs back into the box, box music resumes', async () => {
    await page.keyboard.press('i');
    await page.waitForFunction(
      () => window.__box.gameState.scene === 'inventory' && !window.__box.transition.playing,
      null,
      { timeout: 30000 }
    );
    expect(await page.evaluate(() => window.__box.audio._currentTrack)).toBe('box');
  });

  await test.step('V19: M mutes and unmutes all audio', async () => {
    await page.keyboard.press('m');
    expect(await page.evaluate(() => window.__box.audio.muted)).toBe(true);
    expect(await page.evaluate(() => window.__box.audio.master.gain.value)).toBe(0);
    await page.keyboard.press('m');
    expect(await page.evaluate(() => window.__box.audio.muted)).toBe(false);
  });

  await test.step('V20: hands and world state persist; zero errors', async () => {
    const save = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('box-and-bones:save'))
    );
    expect(save.scene).toBe('inventory');
    expect(save.runsCompleted).toBe(1);
    expect(save.hands).toEqual({ left: null, right: 'map' });
    expect(save.itemLocations.compass).toEqual({ scene: 'inventory-shelf', slot: 0 });
    expect(save.itemLocations['poster-howto']).toEqual({ scene: 'inventory-wall', anchor: 0 });
    expect(save.furniture).toEqual({
      bookshelf: { col: 0, row: 4, rot: 0 },
      desk: { col: 8, row: 7, rot: 0 },
    });
    expect(errors).toEqual([]);
  });

  await test.step('V21: touch controls drive both scenes; BOX only in the maze', async () => {
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('#box-entry')).toBeHidden(); // in the box

    // Hold ▲: one grid step in the box.
    const up = page.locator('#tc-dpad [data-action="moveForward"]');
    await page.evaluate(() => {
      const s = window.__box.inventoryScene;
      s.__c = s.col;
      s.__r = s.row;
    });
    await up.dispatchEvent('pointerdown');
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (
        await page.evaluate(() => {
          const s = window.__box.inventoryScene;
          return s.col !== s.__c || s.row !== s.__r;
        })
      )
        break;
      await page.waitForTimeout(25);
    }
    await up.dispatchEvent('pointerup');
    await page.waitForFunction(() => !window.__box.inventoryScene.isAnimating);
    expect(
      await page.evaluate(() => {
        const s = window.__box.inventoryScene;
        return s.col !== s.__c || s.row !== s.__r;
      })
    ).toBe(true);

    // Inside the box there is nothing to turn: the ⟲ ⟳ buttons are hidden.
    const turnBtn = page.locator('[data-action="turnLeft"]');
    await expect(turnBtn).toBeHidden();
    await expect(page.locator('[data-action="turnRight"]')).toBeHidden();

    // Climb out by tapping the prompt line at the ladder, then step in the maze.
    await navigate(page, [[5, 7]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('climb out');
    await expect(page.locator('#prompt')).toHaveClass(/actionable/);
    await page.locator('#prompt').click();
    await page.waitForFunction(
      () => window.__box.gameState.scene === 'maze' && !window.__box.transition.playing,
      null,
      { timeout: 30000 }
    );

    await markMaze(page);
    const cellBefore = await mazeCell(page);
    await up.dispatchEvent('pointerdown');
    const t1 = Date.now();
    while (Date.now() - t1 < 3000) {
      if (await page.evaluate(mazeCellChanged)) break;
      await page.waitForTimeout(25);
    }
    await up.dispatchEvent('pointerup');
    await page.waitForFunction(() => !window.__box.mazeScene.isAnimating);
    const cellAfter = await mazeCell(page);
    expect(
      Math.abs(cellAfter.x - cellBefore.x) + Math.abs(cellAfter.y - cellBefore.y)
    ).toBe(1);

    // In the maze the turn buttons return, and ⟲ rotates 90°.
    await expect(turnBtn).toBeVisible();
    const f0 = await page.evaluate(() => window.__box.mazeScene.facing);
    await turnBtn.dispatchEvent('pointerdown');
    await turnBtn.dispatchEvent('pointerup');
    await expect
      .poll(() => page.evaluate(() => window.__box.mazeScene.facing), { timeout: 5000 })
      .toBe((f0 + 3) % 4);
    await page.waitForFunction(() => !window.__box.mazeScene.isAnimating);

    // Tapping the cardboard box at your feet looks back into the box.
    await expect(page.locator('#box-entry')).toBeVisible();
    await page.locator('#box-entry').click();
    await page.waitForFunction(
      () => window.__box.gameState.scene === 'inventory' && !window.__box.transition.playing,
      null,
      { timeout: 30000 }
    );
    await expect(page.locator('#box-entry')).toBeHidden();
  });

  await test.step('V22: furniture carries, rotates while carried, and sets down', async () => {
    await navigate(page, [[1, 8], [1, 5]]);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__box.inventoryScene.promptHint || window.__box.inventoryScene.prompt
          ),
        { timeout: 10000 }
      )
      .toContain('move the Bookshelf');
    expect(await page.evaluate(() => window.__box.gameState.furniture.bookshelf)).toEqual({
      col: 0,
      row: 4,
      rot: 0,
    });

    // Grab it, carry it one tile east, set it down.
    await page.keyboard.press('g');
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.grabbing))
      .toBe('bookshelf');
    expect(await boxStep(page, 'd')).toBe(true);
    await page.keyboard.press('g');
    await expect.poll(() => page.evaluate(() => window.__box.inventoryScene.grabbing)).toBe(null);
    expect(await page.evaluate(() => window.__box.gameState.furniture.bookshelf)).toEqual({
      col: 1,
      row: 4,
      rot: 0,
    });
    // Everything in its slots rode along, still recorded by slot index,
    // and the new position is in the save.
    expect(await page.evaluate(() => window.__box.gameState.itemLocations.compass)).toEqual({
      scene: 'inventory-shelf',
      slot: 0,
    });
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('box-and-bones:save')));
    expect(save.furniture.bookshelf).toEqual({ col: 1, row: 4, rot: 0 });

    // While carrying, the ⟲ ⟳ buttons return and the turn keys rotate
    // the piece a quarter-turn (pivot nudging aside if it would land on
    // you); footprint and orientation both change, and rotate back.
    await page.keyboard.press('g');
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.grabbing))
      .toBe('bookshelf');
    await expect(page.locator('[data-action="turnLeft"]')).toBeVisible();
    await page.keyboard.press('e');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.furniture.bookshelf.rot))
      .toBe(1);
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.furniture.bookshelf.rot))
      .toBe(0);

    // Carry it back west; once it stands against the wall a further step
    // is refused with a bump.
    expect(await boxStep(page, 'a')).toBe(true);
    expect(await boxStep(page, 'a', 800)).toBe(false);
    await page.keyboard.press('g');
    await expect.poll(() => page.evaluate(() => window.__box.inventoryScene.grabbing)).toBe(null);
    await expect(page.locator('[data-action="turnLeft"]')).toBeHidden();
    const rest = await page.evaluate(() => window.__box.gameState.furniture.bookshelf);
    expect(rest.col).toBe(0);
    expect(rest.rot).toBe(0);
  });
});
