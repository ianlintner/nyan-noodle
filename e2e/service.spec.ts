import { expect, test } from '@playwright/test';

interface Ticket {
  recipeId: string;
  extras: string[];
  price: number;
  doneness: 'soft' | 'firm' | 'default';
}
interface ServiceApi {
  stage(): string;
  activeIdx(): number;
  streak(): number;
  coins(): number;
  completed(): number[];
  tickets(): Ticket[];
  required(): string[];
  broth(): { samples: number; inBand: number; overheated: boolean; heat: number };
  noodleSweep(): number;
  select(i: number): void;
  addToppingByIndex(i: number): void;
  stopNoodles(): void;
  serve(): void;
  setBrothHeat(h: number): void;
  setNoodleSweep(s: number): void;
}
type ServiceWindow = {
  __nyanService?: ServiceApi;
  __nyan?: { registry: { get(k: string): unknown } };
};

test('scripted service: one ticket cooked through all three minigames and served', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?scene=service&seed=2026&count=4`);
  await page.waitForFunction(
    () => (window as unknown as ServiceWindow).__nyan?.registry.get('serviceReady') === true,
  );

  // Run a serialized expression against the debug API; literals must be inlined.
  const expr = <T>(body: string): Promise<T> =>
    page.evaluate((bodyExpr: string) => {
      const api = (window as unknown as ServiceWindow).__nyanService as ServiceApi;
      return new Function('a', `return (${bodyExpr});`)(api) as T;
    }, body);
  const shoot = (name: string): Promise<Buffer> =>
    page.locator('canvas').screenshot({ path: `test-results/service-${name}.png` });

  // Select the first ticket.
  await expr<void>('(a.select(0), undefined)');
  expect(await expr('a.activeIdx()')).toBe(0);
  expect(await expr('a.stage()')).toBe('broth');
  await shoot('broth');

  // Drive the broth hold: keep the needle in band until it auto-advances.
  // Batch the samples in one page turn: 70 round-trips are slow enough under
  // parallel load that the ticket goes stale before it can be served.
  await expr<void>(
    '(() => { for (let n = 0; n < 70; n++) a.setBrothHeat(n % 2 === 0 ? 0.6 : 0.7); })()',
  );
  expect(await expr('a.stage()')).toBe('noodles');

  // Stop the noodle timer in the sweet spot for the ticket's doneness.
  const doneness = (await expr<Ticket[]>('a.tickets()'))[0]!.doneness;
  const sweet = doneness === 'firm' ? 0.7 : doneness === 'soft' ? 0.55 : 0.62;
  await expr<void>(`a.setNoodleSweep(${sweet})`);
  await shoot('noodles');
  await expr<void>('a.stopNoodles()');
  expect(await expr('a.stage()')).toBe('toppings');

  // Apply all required toppings in order.
  const required = await expr<string[]>('a.required()');
  for (let i = 0; i < required.length; i++) {
    await expr<void>(`a.addToppingByIndex(${i})`);
  }
  await shoot('toppings');
  expect(await expr('a.stage()')).toBe('serve');

  // Serve and read the payout.
  const beforeCoins = await expr<number>('a.coins()');
  await expr<void>('a.serve()');
  const afterCoins = await expr<number>('a.coins()');
  expect(afterCoins).toBeGreaterThan(beforeCoins);
  expect(await expr<number[]>('a.completed()')).toContain(0);
  expect(await expr<number>('a.streak()')).toBe(1);
  await shoot('payout');

  expect(errors).toEqual([]);
});
