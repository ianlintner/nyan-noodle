import { expect, test } from '@playwright/test';

interface NyanWindow {
  __nyan?: {
    registry: { get(k: string): unknown };
    renderer: {
      snapshotPixel(
        x: number,
        y: number,
        cb: (c: { red: number; green: number; blue: number }) => void,
      ): void;
    };
  };
}

test('boot scene renders palette swatches and panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as NyanWindow).__nyan?.registry.get('bootReady') === true,
  );
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(size).toEqual({ w: 480, h: 270 });

  // Sample rendered pixels: first swatch (ink) and the sample panel body (cream).
  const sample = (x: number, y: number) =>
    page.evaluate(
      ([px, py]) =>
        new Promise<number[]>((resolve) => {
          const game = (window as unknown as NyanWindow).__nyan!;
          requestAnimationFrame(() =>
            game.renderer.snapshotPixel(px as number, py as number, (c) =>
              resolve([c.red, c.green, c.blue]),
            ),
          );
        }),
      [x, y],
    );
  expect(await sample(16, 16)).toEqual([0x2b, 0x1d, 0x2e]);
  expect(await sample(400, 100)).toEqual([0xff, 0xf3, 0xd6]);

  await page.screenshot({ path: 'test-results/boot.png' });
  expect(errors).toEqual([]);
});
