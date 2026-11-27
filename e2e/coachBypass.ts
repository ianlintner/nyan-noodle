import type { Page } from '@playwright/test';

/**
 * Existing flows start from a fresh browser context, which a first-run callout would decorate.
 * Pre-seed the game-side hints before boot so their established screenshots and taps stay stable.
 */
export async function bypassCoach(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'nyan-noodle/coach',
        JSON.stringify({
          prep: true,
          kitchen: true,
          shop: true,
          report: true,
          upgrades: true,
          build: true,
        }),
      );
    } catch {
      // A blocked localStorage just falls through to the other preference backends.
    }
  });
}
