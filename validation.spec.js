// Validation suite for Box & Bones.
//
// This file is generated from, and mirrors, `validation.md` — every V-number
// below is a named test.step matching an assertion in that document, in the
// same order. Run via `npm run validate`, which builds the production bundle,
// runs this spec against `vite preview` with tracing on, and copies the
// resulting trace to ./trace.zip for inspection.
//
// The game exposes `window.__box` (game state, scenes, audio) for exactly
// this kind of instrumentation.

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = 'http://localhost:4173/';

test.use({
  viewport: { width: 1280, height: 800 },
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

// Headless rendering can throttle requestAnimationFrame heavily, so all
// movement helpers poll game state instead of assuming frame timing.

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
    const keys = [];
    if (dz > 0.2) keys.push('KeyS');
    if (dz < -0.2) keys.push('KeyW');
    if (dx > 0.2) keys.push('KeyD');
    if (dx < -0.2) keys.push('KeyA');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(100);
    for (const k of keys) await page.keyboard.up(k);
  }
  throw new Error(
    `walkTo(${targetX}, ${targetZ}) timed out at (${lastPos?.x.toFixed(2)}, ${lastPos?.z.toFixed(2)})`
  );
}

// Hold a key just until the maze registers the step/turn (cell or facing
// changes), release, then wait for the tween to finish. Guarantees exactly
// one grid action per call regardless of frame rate.
async function mazeAction(page, key, changed, maxHoldMs = 1500) {
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

test('validation.md contract', async ({ page }) => {
  test.setTimeout(480000);

  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  await test.step('V1: game boots to the start overlay', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expect(page.locator('#start-overlay')).toBeVisible();
    await expect(page.locator('#start-overlay h1')).toHaveText(/Box & Bones/);
    await expect(page.locator('#start-button')).toBeVisible();
  });

  await test.step('V2: Begin starts inside the box with music running', async () => {
    await page.click('#start-button');
    await expect(page.locator('#start-overlay')).toBeHidden();
    await page.waitForFunction(() => window.__box?.gameState.scene === 'inventory');
    await expect(page.locator('#hud-mode')).toHaveText(/inside the box/i);
    const audio = await page.evaluate(() => ({
      ctxState: window.__box.audio.ctx?.state,
      track: window.__box.audio._currentTrack,
    }));
    expect(audio.ctxState).toBe('running');
    expect(audio.track).toBe('box');
  });

  await test.step('V3: How To Play poster opens an explanatory modal', async () => {
    await walkTo(page, -4.5, -4.0);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('How To Play');
    await page.keyboard.press('e');
    await expect(page.locator('#modal-layer')).toBeVisible();
    await expect(page.locator('#modal-content')).toContainText('How To Play');
    await expect(page.locator('#modal-content')).toContainText('maze');
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-layer')).toBeHidden();
  });

  await test.step('V4: Controls poster rebinds keys live', async () => {
    await walkTo(page, -1.4, -4.0);
    await page.keyboard.press('e');
    await expect(page.locator('#modal-content')).toContainText('Controls');
    const dropRow = page.locator('.keybind-row', { hasText: 'Drop Item' });
    await expect(dropRow.locator('button.rebind')).toHaveText('Q');
    await dropRow.locator('button.rebind').click();
    await page.keyboard.press('p');
    await expect(dropRow.locator('button.rebind')).toHaveText('P');
    expect(
      await page.evaluate(() => window.__box.input.bindings.drop)
    ).toBe('KeyP');
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('box-and-bones:bindings')).drop)
    ).toBe('KeyP');
    // rebind back so the rest of the run uses Q
    await dropRow.locator('button.rebind').click();
    await page.keyboard.press('q');
    await expect(dropRow.locator('button.rebind')).toHaveText('Q');
    await page.keyboard.press('Escape');
  });

  await test.step('V5: Settings poster has volume sliders and mute', async () => {
    await walkTo(page, 1.7, -4.0);
    await page.keyboard.press('e');
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
    await page.keyboard.press('Escape');
  });

  await test.step('V6: bulletin board shows the starting objective', async () => {
    await walkTo(page, 4.6, -4.0);
    await page.keyboard.press('e');
    await expect(page.locator('#modal-content')).toContainText('Bulletin Board');
    await expect(page.locator('#modal-content')).toContainText('Find your way to the end of the maze');
    const objectives = await page.evaluate(() => window.__box.gameState.objectives);
    expect(objectives[0].done).toBe(false);
    await page.keyboard.press('Escape');
  });

  await test.step('V7: desk shows the ledger', async () => {
    // Stand beside the desk (its centre is inside its own collider).
    await walkTo(page, 4.4, 1.8);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('Desk');
    await page.keyboard.press('e');
    await expect(page.locator('#modal-content')).toContainText('Desk');
    await expect(page.locator('#modal-content')).toContainText('Current maze layer');
    await expect(page.locator('#modal-content')).toContainText('Full runs completed');
    await page.keyboard.press('Escape');
  });

  await test.step('V8: compass and map rest on shelf slots; E picks up; HUD shows them', async () => {
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
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('pick up the Compass');
    await page.keyboard.press('e');
    await walkTo(page, -4.6, -0.7);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('pick up the Map');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => [...window.__box.gameState.carried].sort())).toEqual([
      'compass',
      'map',
    ]);
    await expect(page.locator('#hud-slots .slot')).toHaveCount(2);
  });

  await test.step('V9: Q sorts carried items onto empty shelf slots; tidy objective completes', async () => {
    await walkTo(page, -4.6, 0.6);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('place the Compass on the shelf');
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.compass))
      .toEqual({ scene: 'inventory', x: -5.47, z: 0.6 });
    let tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy).toBeTruthy();
    expect(tidy.done).toBe(false); // map still carried
    await walkTo(page, -4.6, 2);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('place the Map on the shelf');
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.map))
      .toEqual({ scene: 'inventory', x: -5.47, z: 2 });
    tidy = await page.evaluate(() =>
      window.__box.gameState.objectives.find((o) => o.id === 'tidy-shelf')
    );
    expect(tidy.done).toBe(true);
    // pick both back up for the maze half of the run
    await page.keyboard.press('e'); // map (still standing at its slot)
    await walkTo(page, -4.6, 0.6);
    await page.keyboard.press('e'); // compass
    expect(await page.evaluate(() => window.__box.gameState.carried.size)).toBe(2);
  });

  await test.step('V10: Q away from shelves free-drops at the player', async () => {
    await walkTo(page, 0, 0);
    await page.keyboard.press('q'); // drops compass (drop order: compass first)
    const loc = await page.evaluate(() => window.__box.gameState.itemLocations.compass);
    expect(loc.scene).toBe('inventory');
    expect(Math.hypot(loc.x - 0, loc.z - 0)).toBeLessThan(0.5);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('pick up the Compass');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.__box.gameState.carried.size)).toBe(2);
  });

  await test.step('V11: ladder climbs out through the flatten transition into the maze', async () => {
    const transition = await page.evaluate(
      () => getComputedStyle(document.getElementById('viewport')).transitionProperty
    );
    expect(transition).toContain('transform');
    await walkTo(page, 0, 4.0);
    await expect
      .poll(() => page.evaluate(() => window.__box.inventoryScene.prompt))
      .toContain('climb out');
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__box.gameState.scene === 'maze', null, {
      timeout: 10000,
    });
    await expect(page.locator('#hud-mode')).toHaveText(/the maze/i);
    expect(await page.evaluate(() => window.__box.audio._currentTrack)).toBe('maze');
  });

  await test.step('V12: tile-stepped movement — step, turn, and bump', async () => {
    // Snapshot the pre-action cell/facing inside the page so the hold-until-
    // changed predicate can compare against it.
    const mark = () =>
      page.evaluate(() => {
        const m = window.__box.mazeScene;
        m.__vStartX = m.cellX;
        m.__vStartY = m.cellY;
        m.__vFacing = m.facing;
      });
    const cellChanged = () => {
      const m = window.__box.mazeScene;
      return m.cellX !== m.__vStartX || m.cellY !== m.__vStartY;
    };
    const facingChanged = () => window.__box.mazeScene.facing !== window.__box.mazeScene.__vFacing;

    // One tap of W = exactly one cell along the facing direction.
    await mark();
    const before = await mazeCell(page);
    expect(await mazeAction(page, 'w', cellChanged)).toBe(true);
    const after = await mazeCell(page);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
    expect(after.facing).toBe(before.facing);

    // S steps exactly one cell, back to where we were.
    await mark();
    expect(await mazeAction(page, 's', cellChanged)).toBe(true);
    const backAgain = await mazeCell(page);
    expect({ x: backAgain.x, y: backAgain.y }).toEqual({ x: before.x, y: before.y });

    // A turns 90° left in place, D turns back.
    await mark();
    expect(await mazeAction(page, 'a', facingChanged)).toBe(true);
    const turnedLeft = await mazeCell(page);
    expect(turnedLeft.facing).toBe((before.facing + 3) % 4);
    expect({ x: turnedLeft.x, y: turnedLeft.y }).toEqual({ x: backAgain.x, y: backAgain.y });
    await mark();
    expect(await mazeAction(page, 'd', facingChanged)).toBe(true);
    expect((await mazeCell(page)).facing).toBe(before.facing);

    // Bump: turn to face a walled direction; W must not move.
    const walledFacing = await page.evaluate(() => {
      const m = window.__box.mazeScene;
      const cell = m.world.cellAt(m.cellX, m.cellY);
      return ['N', 'E', 'S', 'W'].findIndex((w) => cell[w]);
    });
    expect(walledFacing).toBeGreaterThanOrEqual(0); // every maze cell has at least one wall
    while ((await mazeCell(page)).facing !== walledFacing) {
      await mark();
      expect(await mazeAction(page, 'd', facingChanged)).toBe(true);
    }
    await mark();
    const beforeBump = await mazeCell(page);
    expect(await mazeAction(page, 'w', cellChanged, 800)).toBe(false);
    const afterBump = await mazeCell(page);
    expect({ x: afterBump.x, y: afterBump.y }).toEqual({ x: beforeBump.x, y: beforeBump.y });
  });

  await test.step('V13: compass and minimap overlays show in the maze and toggle with 1/2', async () => {
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

  await test.step('V14: reaching the exit nests new layers outward, then resets the run', async () => {
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
    await page.waitForFunction(() => window.__box.gameState.mazeLayer === 2);
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(7);
    expect(
      await page.evaluate(() => window.__box.gameState.objectives.some((o) => o.id === 'escape-2'))
    ).toBe(true);

    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.mazeLayer === 3);
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(11);

    await teleportToExit();
    await page.waitForFunction(() => window.__box.gameState.runsCompleted === 1);
    expect(await page.evaluate(() => window.__box.gameState.mazeLayer)).toBe(1);
    expect(await page.evaluate(() => window.__box.mazeScene.world.halfExtent)).toBe(3);
    const objectives = await page.evaluate(() => window.__box.gameState.objectives);
    expect(objectives).toHaveLength(1);
    expect(objectives[0].done).toBe(false);
  });

  await test.step('V15: items drop into and pick up from the maze floor', async () => {
    await page.keyboard.press('q'); // drops compass at player
    await expect
      .poll(() => page.evaluate(() => window.__box.gameState.itemLocations.compass?.scene))
      .toBe('maze');
    await expect
      .poll(() => page.evaluate(() => window.__box.mazeScene.prompt))
      .toContain('pick up the Compass');
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.__box.gameState.hasItem('compass'))).toBe(true);
  });

  await test.step('V16: I climbs back into the box, box music resumes', async () => {
    await page.keyboard.press('i');
    await page.waitForFunction(() => window.__box.gameState.scene === 'inventory', null, {
      timeout: 10000,
    });
    await expect(page.locator('#hud-mode')).toHaveText(/inside the box/i);
    expect(await page.evaluate(() => window.__box.audio._currentTrack)).toBe('box');
  });

  await test.step('V17: M mutes and unmutes all audio', async () => {
    await page.keyboard.press('m');
    expect(await page.evaluate(() => window.__box.audio.muted)).toBe(true);
    expect(await page.evaluate(() => window.__box.audio.master.gain.value)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('box-and-bones:muted'))).toBe('1');
    await page.keyboard.press('m');
    expect(await page.evaluate(() => window.__box.audio.muted)).toBe(false);
  });

  await test.step('V18: state persists to localStorage and the run produced zero errors', async () => {
    const save = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('box-and-bones:save'))
    );
    expect(save.scene).toBe('inventory');
    expect(save.mazeLayer).toBe(1);
    expect(save.runsCompleted).toBe(1);
    expect([...save.carried].sort()).toEqual(['compass', 'map']);
    expect(errors).toEqual([]);
  });
});
