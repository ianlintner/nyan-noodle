/**
 * Headless 30-day simulation. Prints a per-day revenue curve.
 * Byte-identical across runs for a fixed seed (all randomness via seeded RNG).
 */
import { createRng, createSimState, runSimulation } from '../packages/sim/src/index';

const DAYS = Number.parseInt(process.env.SIM_DAYS ?? '30', 10);
const SEED = Number.parseInt(process.env.SIM_SEED ?? '1337', 10);

const rng = createRng(SEED);
const initialState = createSimState(SEED, 'cart');
const final = runSimulation(initialState, rng, DAYS);

console.log(`Nyan Noodle — ${DAYS}-day headless sim (seed=${SEED})`);
console.log('day,revenue');
final.revenueHistory.forEach((revenue, index) => {
  console.log(`${index + 1},${revenue}`);
});

const total = final.revenueHistory.reduce((sum, revenue) => sum + revenue, 0);
const report = final.lastReport;
console.log(`total,${total}`);
console.log(`finalFishCoins,${final.economy.fishCoins}`);
console.log(`finalReputation,${final.economy.reputation}`);
console.log(`regulars,${final.regulars.length}`);
console.log(`lastReport,${JSON.stringify(report)}`);
