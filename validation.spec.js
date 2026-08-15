// Validation suite for Box & Bones.
//
// This file is generated from, and mirrors, `validation.md` — every V-number
// below is a named test.step matching an assertion in that document, in the
// same order. Run via `npm run validate`, which builds the production bundle,
// runs this spec against `vite preview` with tracing on, and copies the
// resulting trace to ./trace.zip for inspection.
//
// The game exposes `window.__box` (game state, scenes, audio, detail view,
// transition) for exactly this kind of instrumentation.
//
// Headless rendering throttles requestAnimationFrame heavily and the game
// clamps dt per frame, so camera tweens and scene transitions take several
// times their nominal duration here — every wait polls game state with
// generous timeouts instead of assuming frame timing.

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = 'http://localhost:4173/';

test.use({
  viewport: { width: 1280, height: 800 },
  // Run the whole suite in a touch-capable context (per validation.md):
  // the touch UI is visible in every trace screenshot, and V21 exercises it.
  hasTouch: true,
  // Always record a trace with screenshots. Per-action DOM snapshots are
  // disabled: the game renders to a canvas (snapshots show nothing useful)
  // and their capture overhead stretches every key tap enough to break the
  // fine-grained movement this suite depends on.
  trace: { mode: 'on', screenshots: true, snapshots: false, sources: true },
  // In sandboxed environments the bundled browser download is unavailable;
  // point CHROMIUM_PATH at a system chromium there. Unset = default browser.
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

// Box movement is screen-relative in the isometric view: "up" walks toward
// the top of the screen, which in world space is (-1,-1)/sqrt2. Derive key
// presses by projecting the desired world direction onto the screen axes.
const ISO_F = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }; // screen-up in world
const ISO_R = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }; // screen-right in world

async function walkTo(page, targetX, targetZ, timeoutMs = 60000) {
  const start = Date.now();
  let lastPos = null;
  while (Date.now() - start < timeoutMs) {
    const p = await page.evaluate(() => ({
      x: window.__box.inventoryScene.playerX,
      z: window.__box.inventoryScene.playerZ,
    }));
    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    if (Math.hypot(dx, dz) < 0.3) return;
    lastPos = p;
    const fwd = dx * ISO_F.x + dz * ISO_F.z;
    const right = dx * ISO_R.x + dz * ISO_R.z;
    const keys = [];
    if (fwd > 0.15) keys.push('KeyW');
    if (fwd < -0.15) keys.push('KeyS');
    if (right > 0.15) keys.push('KeyD');
    if (right < -0.15) keys.push('KeyA');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(100);
    for (const k of keys) await page.keyboard.up(k);
  }
  throw new Error(
    `walkTo(${targetX}, ${targetZ}) timed out at (${lastPos?.x.toFixed(2)}, ${lastPos?.z.toFixed(2)})`
  );
}

// Open a world object's detailed view with USE and wait for its panel
// (the camera flies to the object first, which takes a while throttled).
async function openDetail(page) {
  await page.keyboard.press('e');
  await expect(page.locator('#modal-layer')).toBeVisible({ timeout: 20000 });
}

async function closeDetail(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
}

// Hold a key just until the maze registers the step/turn, release, then
// wait for the tween. Guarantees exactly one grid action per call.
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

test('validation.md contract', async ({ page }) => {
  test.setTimeout(600000);

  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await test.step('V1: boots into the title poster detailed view', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expect(page.locator('#modal-layer')).toBeVisible();
    await expect(page.locator('#modal-content')).toContainText('Box & Bones');
    await expect(page.locator('#detail-begin')).toBeVisible();
    expect(await page.evaluate(() => window.__box.detailView.isOpen())).toBe(true);
    // Cannot be dismissed before BEGIN.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__box.detailView.isOpen())).toBe(true);
  });

  await test.step('V2: BEGIN zooms out into the isometric box', async () => {
    await page.click('#detail-begin');
    await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
    expect(await page.evaluate(() => window.__box.gameState.scene)).toBe('inventory');
    await expect(page.locator('#hud-mode')).toHaveText(/inside the box/i);
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
  });

  await test.step('V3: How To Play poster opens as a camera-zoom detailed view', async () => {
    await walkTo(page, -4.5, -3.6);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('How To Play poster');
    expect(await page.evaluate(() => window.__box.inventoryScene.cameraOverride)).toBe(false);
    await openDetail(page);
    expect(await page.evaluate(() => window.__box.inventoryScene.cameraOverride)).toBe(true);
    await expect(page.locator('#modal-content')).toContainText('How To Play');
    await expect(page.locator('#modal-content')).toContainText('maze');
    await closeDetail(page);
    expect(await page.evaluate(() => window.__box.inventoryScene.cameraOverride)).toBe(false);
  });

  await test.step('V4: Controls poster rebinds keys live', async () => {
    await walkTo(page, -1.4, -3.6);
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Controls');
    const dropRow = page.locator('.keybind-row', { hasText: 'Drop Item' });
    await expect(dropRow.locator('button.rebind')).toHaveText('Q');
    await dropRow.locator('button.rebind').click();
    await page.keyboard.press('p');
    await expect(dropRow.locator('button.rebind')).toHaveText('P');
    expect(await page.evaluate(() => window.__box.input.bindings.drop)).toBe('KeyP');
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('box-and-bones:bindings')).drop)
    ).toBe('KeyP');
    await dropRow.locator('button.rebind').click();
    await page.keyboard.press('q');
    await expect(dropRow.locator('button.rebind')).toHaveText('Q');
    await closeDetail(page);
  });

  await test.step('V5: Settings poster has volume sliders and mute', async () => {
    await walkTo(page, 1.7, -3.6);
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
    await expect(page.locator('#modal-content button.rebind', { hasText: 'Reset Save Data' })).toBeVisible();
    await musicRow.locator('input[type=range]').evaluate((el) => {
      el.value = '0.2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(await page.evaluate(() => window.__box.audio.musicVolume)).toBe(0.2);
    expect(await page.evaluate(() => localStorage.getItem('box-and-bones:musicVolume'))).toBe('0.2');
    await closeDetail(page);
  });

  await test.step('V6: bulletin board shows the starting objective', async () => {
    await walkTo(page, 4.6, -3.6);
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Bulletin Board');
    await expect(page.locator('#modal-content')).toContainText('Find your way to the end of the maze');
    const objectives = await page.evaluate(() => window.__box.gameState.objectives);
    expect(objectives[0].done).toBe(false);
    await closeDetail(page);
  });

  await test.step('V7: desk shows the ledger', async () => {
    await walkTo(page, 4.4, 1.8);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('Desk');
    await openDetail(page);
    await expect(page.locator('#modal-content')).toContainText('Desk');
    await expect(page.locator('#modal-content')).toContainText('Current maze layer');
    await expect(page.locator('#modal-content')).toContainText('Full runs completed');
    await closeDetail(page);
  });

  await test.step('V8: posters come off the wall, drop as scrolls, and re-hang', async () => {
    await walkTo(page, -4.5, -3.6);
    await openDetail(page);
    await page.locator('button[data-take-down="poster-howto"]').click();
    await page.waitForFunction(() => !window.__box.detailView.isOpen(), null, { timeout: 20000 });
    expect(await page.evaluate(() => window.__box.gameState.hasItem('poster-howto'))).toBe(true);
    expect(
      await page.evaluate(() => window.__box.gameState.itemLocations['poster-howto'])
    ).toBeUndefined();

    await walkTo(page, 0, 0);
    await page.keyboard.press('q');
    const dropped = await page.evaluate(() => window.__box.gameState.itemLocations['poster-howto']);
    expect(dropped.scene).toBe('inventory');
    expect(Math.hypot(dropped.x, dropped.z)).toBeLessThan(0.5);

    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('pick up the How To Play poster');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.__box.gameState.hasItem('poster-howto'))).toBe(true);

    await walkTo(page, -4.5, -3.6);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('hang the How To Play poster');
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations['poster-howto']))
      .toEqual({ scene: 'inventory-wall', anchor: 0 });
  });

  await test.step('V9: compass and map rest on shelf slots; USE picks up; HUD shows them', async () => {
    const initial = await page.evaluate(() => ({
      locs: window.__box.gameState.itemLocations,
      slots: window.__box.inventoryScene.shelfSlots,
    }));
    for (const id of ['compass', 'map']) {
      const loc = initial.locs[id];
      expect(loc.scene).toBe('inventory');
      expect(
        initial.slots.some((s) => Math.abs(s.x - loc.x) < 0.05 && Math.abs(s.z - loc.z) < 0.05)
      ).toBe(true);
    }
    await walkTo(page, -4.6, -2);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('pick up the Compass');
    await page.keyboard.press('e');
    await walkTo(page, -4.6, -0.7);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('pick up the Map');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => [...window.__box.gameState.carried])).toEqual([
      'compass',
      'map',
    ]);
    await expect(page.locator('#hud-slots .slot')).toHaveCount(2);
  });

  await test.step('V10: Q sorts the most recent item onto empty shelf slots; tidy objective completes', async () => {
    // Carried [compass, map] — the map was picked up last, so it drops first.
    await walkTo(page, -4.6, 0.6);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('place the Map on the shelf');
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.map))
      .toEqual({ scene: 'inventory', x: -5.47, z: 0.6 });
    let tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy).toBeTruthy();
    expect(tidy.done).toBe(false); // compass still carried
    await walkTo(page, -4.6, 2);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('place the Compass on the shelf');
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.compass))
      .toEqual({ scene: 'inventory', x: -5.47, z: 2 });
    tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy.done).toBe(true);
    // pick both back up for the maze half of the run
    await page.keyboard.press('e'); // compass (still standing at its slot)
    await walkTo(page, -4.6, 0.6);
    await page.keyboard.press('e'); // map
    expect(await page.evaluate(() => window.__box.gameState.carried.length)).toBe(2);
  });

  await test.step('V11: carried items open their own detailed views from the HUD', async () => {
    await page.locator('#hud-slots .slot[data-item="map"]').click();
    await expect(page.locator('#modal-layer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#modal-content')).toContainText('Map');
    await expect(page.locator('#modal-content canvas')).toBeVisible();
    await closeDetail(page);
    await page.locator('#hud-slots .slot[data-item="compass"]').click();
    await expect(page.locator('#modal-layer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#modal-content')).toContainText('Compass');
    await closeDetail(page);
  });

  await test.step('V12: Q away from shelves and hooks free-drops at the player', async () => {
    await walkTo(page, 0, 0);
    await page.keyboard.press('q'); // drops the map (picked up last)
    const loc = await page.evaluate(() => window.__box.gameState.itemLocations.map);
    expect(loc.scene).toBe('inventory');
    expect(Math.hypot(loc.x, loc.z)).toBeLessThan(0.5);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('pick up the Map');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.__box.gameState.carried.length)).toBe(2);
  });

  await test.step('V13: the ladder climbs out through the flatten transition into the maze', async () => {
    await page.evaluate(() => {
      window.__sawFade = false;
      const el = document.getElementById('fade-overlay');
      new MutationObserver(() => {
        if (el.classList.contains('active')) window.__sawFade = true;
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    await walkTo(page, 0, 4.0);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt), { timeout: 10000 })
      .toContain('climb out');
    await page.keyboard.press('e');
    await page.waitForFunction(
      () =>
        window.__box.gameState.scene === 'maze' &&
        !window.__box.transition.playing &&
        Math.abs(window.__box.mazeScene.camera.fov - 72) < 0.5,
      null,
      { timeout: 30000 }
    );
    expect(await page.evaluate(() => window.__sawFade)).toBe(true);
    await expect(page.locator('#hud-mode')).toHaveText(/the maze/i);
    expect(await page.evaluate(() => window.__box.audio._currentTrack)).toBe('maze');
  });

  await test.step('V14: tile-stepped movement — step, turn, and bump', async () => {
    await markMaze(page);
    const before = await mazeCell(page);
    expect(await mazeAction(page, 'w', mazeCellChanged)).toBe(true);
    const after = await mazeCell(page);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
    expect(after.facing).toBe(before.facing);

    await markMaze(page);
    expect(await mazeAction(page, 's', mazeCellChanged)).toBe(true);
    const backAgain = await mazeCell(page);
    expect({ x: backAgain.x, y: backAgain.y }).toEqual({ x: before.x, y: before.y });

    await markMaze(page);
    expect(await mazeAction(page, 'a', mazeFacingChanged)).toBe(true);
    const turnedLeft = await mazeCell(page);
    expect(turnedLeft.facing).toBe((before.facing + 3) % 4);
    expect({ x: turnedLeft.x, y: turnedLeft.y }).toEqual({ x: backAgain.x, y: backAgain.y });
    await markMaze(page);
    expect(await mazeAction(page, 'd', mazeFacingChanged)).toBe(true);
    expect((await mazeCell(page)).facing).toBe(before.facing);

    const walledFacing = await page.evaluate(() => {
      const m = window.__box.mazeScene;
      const cell = m.world.cellAt(m.cellX, m.cellY);
      return ['N', 'E', 'S', 'W'].findIndex((w) => cell[w]);
    });
    expect(walledFacing).toBeGreaterThanOrEqual(0);
    while ((await mazeCell(page)).facing !== walledFacing) {
      await markMaze(page);
      expect(await mazeAction(page, 'd', mazeFacingChanged)).toBe(true);
    }
    await markMaze(page);
    const beforeBump = await mazeCell(page);
    expect(await mazeAction(page, 'w', mazeCellChanged, 800)).toBe(false);
    const afterBump = await mazeCell(page);
    expect({ x: afterBump.x, y: afterBump.y }).toEqual({ x: beforeBump.x, y: beforeBump.y });
  });

  await test.step('V15: compass and minimap overlays show in the maze and toggle with 1/2', async () => {
    await expect(page.locator('#compass-wrap')).toBeVisible();
    await expect(page.locator('#minimap-wrap')).toBeVisible();
    await page.keyboard.press('2');
    await expect(page.locator('#minimap-wrap')).toBeHidden();
    expect(await page.evaluate(() => window.__box.gameState.activeMap)).toBe(false);
    await page.keyboard.press('2');
    await expect(page.locator('#minimap-wrap')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('#compass-wrap')).toBeHidden();
    await page.keyboard.press('1');
    await expect(page.locator('#compass-wrap')).toBeVisible();
  });

  await test.step('V16: reaching the exit nests new layers outward, then resets the run', async () => {
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
    expect(
      await page.evaluate(() => window.__box.gameState.objectives.some((o) => o.id === 'escape-2'))
    ).toBe(true);

    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.mazeLayer === 3, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(11);

    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.runsCompleted === 1, null, {
      timeout: 10000,
    });
    expect(await page.evaluate(() => window.__box.gameState.mazeLayer)).toBe(1);
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(3);
    const objectives = await page.evaluate(() => window.__box.gameState.objectives);
    expect(objectives).toHaveLength(1);
    expect(objectives[0].done).toBe(false);
  });

  await test.step('V17: items drop into and pick up from the maze floor', async () => {
    await page.keyboard.press('q'); // drops the map (most recent)
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.map?.scene))
      .toBe('maze');
    await expect
      .poll(() => page.evaluate(() => window.__box.mazeScene.prompt), { timeout: 10000 })
      .toContain('pick up the Map');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.__box.gameState.hasItem('map'))).toBe(true);
  });

  await test.step('V18: I climbs back into the box, box music resumes', async () => {
    await page.keyboard.press('i');
    await page.waitForFunction(
      () => window.__box.gameState.scene === 'inventory' && !window.__box.transition.playing,
      null,
      { timeout: 30000 }
    );
    await expect(page.locator('#hud-mode')).toHaveText(/inside the box/i);
    expect(await page.evaluate(() => window.__box.audio._currentTrack)).toBe('box');
  });

  await test.step('V19: M mutes and unmutes all audio', async () => {
    await page.keyboard.press('m');
    expect(await page.evaluate(() => window.__box.audio.muted)).toBe(true);
    expect(await page.evaluate(() => window.__box.audio.master.gain.value)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('box-and-bones:muted'))).toBe('1');
    await page.keyboard.press('m');
    expect(await page.evaluate(() => window.__box.audio.muted)).toBe(false);
  });

  await test.step('V20: state persists to localStorage and the run produced zero errors', async () => {
    const save = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('box-and-bones:save'))
    );
    expect(save.scene).toBe('inventory');
    expect(save.mazeLayer).toBe(1);
    expect(save.runsCompleted).toBe(1);
    expect([...save.carried].sort()).toEqual(['compass', 'map']);
    expect(save.itemLocations['poster-howto']).toEqual({ scene: 'inventory-wall', anchor: 0 });
    expect(errors).toEqual([]);
  });

  await test.step('V21: touch controls drive both scenes', async () => {
    await expect(page.locator('#touch-controls')).toBeVisible();

    const up = page.locator('#tc-dpad [data-action="moveForward"]');
    const before = await page.evaluate(() => ({
      x: window.__box.inventoryScene.playerX,
      z: window.__box.inventoryScene.playerZ,
    }));
    await up.dispatchEvent('pointerdown');
    await page.waitForTimeout(700);
    await up.dispatchEvent('pointerup');
    const after = await page.evaluate(() => ({
      x: window.__box.inventoryScene.playerX,
      z: window.__box.inventoryScene.playerZ,
    }));
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.1);

    const boxBtn = page.locator('#tc-actions [data-action="inventory"]');
    await boxBtn.dispatchEvent('pointerdown');
    await boxBtn.dispatchEvent('pointerup');
    await page.waitForFunction(
      () => window.__box.gameState.scene === 'maze' && !window.__box.transition.playing,
      null,
      { timeout: 30000 }
    );

    await markMaze(page);
    const cellBefore = await mazeCell(page);
    await up.dispatchEvent('pointerdown');
    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (await page.evaluate(mazeCellChanged)) break;
      await page.waitForTimeout(25);
    }
    await up.dispatchEvent('pointerup');
    await page.waitForFunction(() => !window.__box.mazeScene.isAnimating);
    const cellAfter = await mazeCell(page);
    expect(
      Math.abs(cellAfter.x - cellBefore.x) + Math.abs(cellAfter.y - cellBefore.y)
    ).toBe(1);

    const left = page.locator('#tc-dpad [data-action="moveLeft"]');
    await markMaze(page);
    await left.dispatchEvent('pointerdown');
    const tStart = Date.now();
    while (Date.now() - tStart < 3000) {
      if (await page.evaluate(mazeFacingChanged)) break;
      await page.waitForTimeout(25);
    }
    await left.dispatchEvent('pointerup');
    await page.waitForFunction(() => !window.__box.mazeScene.isAnimating);
    expect((await mazeCell(page)).facing).toBe((cellAfter.facing + 3) % 4);
  });
});
