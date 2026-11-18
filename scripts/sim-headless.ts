/**
 * Headless day-loop simulation with the reference autopilot (prep -> service -> report ->
 * upgrades). Prints a per-day table. Byte-identical across runs for a fixed seed.
 */
import { autopilotDay, createSimState } from '../packages/sim/src/index';

const DAYS = Number.parseInt(process.env.SIM_DAYS ?? '10', 10);
const SEED = Number.parseInt(process.env.SIM_SEED ?? '1337', 10);

let state = createSimState(SEED, 'cart');
console.log(`Nyan Noodle — ${DAYS}-day headless autopilot (seed=${SEED})`);
console.log('day,tier,served,lost,revenue,tips,costs,coins,stars,staff,complaints');
for (let d = 0; d < DAYS; d++) {
  const { state: next, report } = autopilotDay(state);
  console.log(
    [
      report.day,
      next.tierId,
      report.customersServed,
      report.customersLost,
      report.revenue,
      report.tips,
      report.costs,
      next.economy.fishCoins,
      report.reputation,
      next.staff.roster.length,
      report.complaints,
    ].join(','),
  );
  state = next;
}
console.log(`lifetimeEarned,${state.economy.lifetimeEarned}`);
console.log(`unlockedRecipes,${state.unlockedRecipes.join('+')}`);
