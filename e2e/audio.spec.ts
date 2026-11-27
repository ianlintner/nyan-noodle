import { expect, test, type Page } from '@playwright/test';

interface AudioState {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}
interface Snapshot {
  unlocked: boolean;
  mode: string;
  settings: AudioState;
}

interface W {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanAudio?: { snapshot(): Snapshot };
}

const titleReady = (page: Page) =>
  page.waitForFunction(() => (window as unknown as W).__nyan?.registry.get('titleReady') === true);

const audio = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__nyanAudio!.snapshot().settings);

/** Map a native 480x270 coordinate to the scaled canvas and click it with a real mouse. */
async function clickNative(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 480;
  await page.mouse.click(box.x + x * k, box.y + y * k);
}

test.use({ viewport: { width: 960, height: 540 } });

test('title audio panel edits volumes and survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await titleReady(page);

  const initial = await audio(page);
  expect(initial.muted).toBe(false);
  expect(initial.master).toBeGreaterThan(0);

  // Real click on the top-right Sound button opens the panel.
  await clickNative(page, 450, 19);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/title-audio-settings.png' });

  // Master "+" and "−" steppers in the Audio panel.
  await clickNative(page, 438, 97); // Master "+"
  await page.waitForTimeout(60);
  const bumped = await audio(page);
  expect(bumped.master).toBeGreaterThan(initial.master);
  await clickNative(page, 400, 163); // Mute toggle
  await page.waitForTimeout(350); // debounced persistence
  expect((await audio(page)).muted).toBe(true);

  await page.reload();
  await titleReady(page);
  const after = await audio(page);
  expect(after.master).toBeCloseTo(bumped.master, 5);
  expect(after.muted).toBe(true);
  expect(errors).toEqual([]);
});
