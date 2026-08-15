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
// with the previous position. Strafes cover every direction, so no turning
// is needed: for world direction d and current facing f, the key is
// ['w','d','s','a'][(d - f + 4) % 4].
async function navigate(page, waypoints) {
  for (const [col, row] of waypoints) {
    for (let guard = 0; guard < 30; guard++) {
      const t = await boxTile(page);
      if (t.col === col && t.row === row) break;
      let dir;
      if (t.col < col) dir = 1;
      else if (t.col > col) dir = 3;
      else if (t.row < row) dir = 2;
      else dir = 0;
      const key = ['w', 'd', 's', 'a'][(dir - t.facing + 4) % 4];
      const moved = await boxStep(page, key);
      if (!moved) throw new Error(`blocked stepping ${dir} at ${t.col},${t.row}`);
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
    await expect(page.locator('#modal-content')).toContainText('Box & Bones');
    await expect(page.locator('#detail-begin')).toBeVisible();
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
      ctxState: window.__box.audio.ctx?.state,
      track: window.__box.audio._currentTrack,
    }));
    expect(cam.ortho).toBe(true);
    expect(Math.abs(cam.zoom - 1)).toBeLessThan(0.05);
    expect(cam.ctxState).toBe('running');
    expect(cam.track).toBe('box');
    await expect(page.locator('.tc-box')).toBeHidden();
  });

  await test.step('V3: How To Play poster, read on the poster', async () => {
    await navigate(page, [[1, 2], [1, 0]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('How To Play poster');
    await openDetail(page);
    await expect(page.locator('#modal-box')).toHaveClass(/panel-world/);
    await expect(page.locator('#modal-content')).toContainText('How To Play');
    await expect(page.locator('#modal-content')).toContainText('two hands');
    await closeDetail(page);
    expect(await page.evaluate(() => window.__box.inventoryScene.cameraOverride)).toBe(false);
  });

  await test.step('V4: Controls poster rebinds keys live', async () => {
    await navigate(page, [[3, 0]]);
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Controls');
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
    await navigate(page, [[5, 0]]);
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Settings');
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
    await navigate(page, [[7, 0]]);
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Bulletin Board');
    await expect(page.locator('#modal-content')).toContainText('Find your way to the end of the maze');
    await closeDetail(page);
  });

  await test.step('V7: desk shows the ledger on its paper', async () => {
    await navigate(page, [[5, 0], [5, 5], [6, 5]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('Desk');
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Current maze layer');
    await expect(page.locator('#modal-box')).toHaveClass(/panel-paper/);
    await closeDetail(page);
  });

  await test.step('V8: posters come off the wall into a hand, drop as scrolls, re-hang', async () => {
    await navigate(page, [[5, 5], [5, 0], [1, 0]]);
    await openDetail(page);
    await page.locator('button[data-take-down="poster-howto"]').click();
    await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
    expect(await page.evaluate(() => window.__box.gameState.hands.right)).toBe('poster-howto');

    await navigate(page, [[3, 0], [3, 2]]);
    await page.keyboard.press('c');
    const dropped = await page.evaluate(() => window.__box.gameState.itemLocations['poster-howto']);
    expect(dropped.scene).toBe('inventory');
    const tile = await boxTile(page);
    expect(Math.hypot(dropped.x - (-5.25 + tile.col * 1.5), dropped.z - (-3.75 + tile.row * 1.5))).toBeLessThan(0.6);

    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('pick up the How To Play poster');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.right)).toBe('poster-howto');

    await navigate(page, [[1, 2], [1, 0]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('hang the How To Play poster');
    await page.keyboard.press('c');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations['poster-howto']))
      .toEqual({ scene: 'inventory-wall', anchor: 0 });
  });

  await test.step('V9: compass and map pick up into right then left hand', async () => {
    await navigate(page, [[1, 1]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('pick up the Compass');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.right)).toBe('compass');
    await navigate(page, [[1, 2]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('pick up the Map');
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => window.__box.gameState.hands.left)).toBe('map');
    await expect(page.locator('#hand-right')).toHaveAttribute('data-item', 'compass');
    await expect(page.locator('#hand-left')).toHaveAttribute('data-item', 'map');
  });

  await test.step('V10: per-hand shelf sorting completes the tidy objective', async () => {
    await navigate(page, [[1, 3]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('place the Compass on the shelf');
    await page.keyboard.press('c');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.compass))
      .toEqual({ scene: 'inventory', x: -5.47, z: 0.6 });
    let tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy.done).toBe(false); // map still in the left hand
    await navigate(page, [[1, 4]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('place the Map on the shelf');
    await page.keyboard.press('z');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.map))
      .toEqual({ scene: 'inventory', x: -5.47, z: 2 });
    tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy.done).toBe(true);
    // pick both back up for the maze half of the run
    await page.keyboard.press('f'); // map (at this slot) -> right hand
    await navigate(page, [[1, 3]]);
    await page.keyboard.press('f'); // compass -> left hand
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
    await navigate(page, [[3, 3]]);
    await page.keyboard.press('z'); // left hand: compass
    const loc = await page.evaluate(() => window.__box.gameState.itemLocations.compass);
    expect(loc.scene).toBe('inventory');
    const t = await boxTile(page);
    expect(Math.hypot(loc.x - (-5.25 + t.col * 1.5), loc.z - (-3.75 + t.row * 1.5))).toBeLessThan(0.6);
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
    await navigate(page, [[3, 3], [3, 5]]);
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
    await expect(page.locator('.tc-box')).toBeVisible();
  });

  await test.step('V14: maze steps, strafes, turns, and bumps', async () => {
    // Step forward exactly one cell.
    await markMaze(page);
    const before = await mazeCell(page);
    expect(await mazeAction(page, 'w', mazeCellChanged)).toBe(true);
    const after = await mazeCell(page);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
    expect(after.facing).toBe(before.facing);

    // Step back to where we were.
    await markMaze(page);
    expect(await mazeAction(page, 's', mazeCellChanged)).toBe(true);
    expect(await mazeCell(page)).toEqual(before);

    // Turns rotate 90° in place (Q left, E right).
    await markMaze(page);
    expect(await mazeAction(page, 'q', mazeFacingChanged)).toBe(true);
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

  await test.step('V15: compass and minimap overlays toggle with 1/2', async () => {
    await expect(page.locator('#compass-wrap')).toBeVisible();
    await expect(page.locator('#minimap-wrap')).toBeVisible();
    await page.keyboard.press('2');
    await expect(page.locator('#minimap-wrap')).toBeHidden();
    await page.keyboard.press('2');
    await expect(page.locator('#minimap-wrap')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('#compass-wrap')).toBeHidden();
    await page.keyboard.press('1');
    await expect(page.locator('#compass-wrap')).toBeVisible();
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
    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.runsCompleted === 1, null, {
      timeout: 10000,
    });
    expect(await page.evaluate(() => window.__box.gameState.mazeLayer)).toBe(1);
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(3);
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
    expect(save.hands).toEqual({ left: 'compass', right: 'map' });
    expect(save.itemLocations['poster-howto']).toEqual({ scene: 'inventory-wall', anchor: 0 });
    expect(errors).toEqual([]);
  });

  await test.step('V21: touch controls drive both scenes; BOX only in the maze', async () => {
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('.tc-box')).toBeHidden(); // in the box

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

    // Turn button rotates the avatar.
    const before = await boxTile(page);
    const turnBtn = page.locator('[data-action="turnLeft"]');
    await turnBtn.dispatchEvent('pointerdown');
    await turnBtn.dispatchEvent('pointerup');
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.facing), { timeout: 5000 })
      .toBe((before.facing + 3) % 4);

    // Climb out with the USE button at the ladder, then step in the maze.
    // (turn back to north first so navigation math stays simple)
    await turnBtn.dispatchEvent('pointerdown');
    await turnBtn.dispatchEvent('pointerup');
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.facing), { timeout: 5000 })
      .toBe((before.facing + 2) % 4);
    await turnBtn.dispatchEvent('pointerdown');
    await turnBtn.dispatchEvent('pointerup');
    await turnBtn.dispatchEvent('pointerdown');
    await turnBtn.dispatchEvent('pointerup');
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.facing), { timeout: 5000 })
      .toBe(before.facing);

    await navigate(page, [[3, 3], [3, 5]]);
    await expect.poll(() => boxPrompt(page), { timeout: 10000 }).toContain('climb out');
    const useBtn = page.locator('[data-action="interact"]');
    await useBtn.dispatchEvent('pointerdown');
    await useBtn.dispatchEvent('pointerup');
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
  });
});
