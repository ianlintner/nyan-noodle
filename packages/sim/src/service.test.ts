import { describe, expect, it } from 'vitest';
import { createSimState } from './state';
import { planService, SEAT_TURNOVER_BEATS } from './service';

describe('planService', () => {
  const state = createSimState(2026, 'cart');

  it('is deterministic for a fixed state', () => {
    expect(planService(state)).toEqual(planService(state));
  });

  it('never seats more cats than seats at once and respects turnover', () => {
    for (const tierId of ['cart', 'stall', 'small-shop'] as const) {
      const plan = planService(createSimState(7, tierId));
      const bySeat = new Map<number, { from: number; to: number }[]>();
      for (const v of plan.visits) {
        if (v.seatIndex === null) continue;
        const list = bySeat.get(v.seatIndex) ?? [];
        list.push({ from: v.seatBeat!, to: v.leaveBeat });
        bySeat.set(v.seatIndex, list);
      }
      for (const [seat, spans] of bySeat) {
        expect(seat).toBeLessThan(plan.seats);
        spans.sort((a, b) => a.from - b.from);
        for (let i = 1; i < spans.length; i++) {
          expect(spans[i]!.from).toBeGreaterThanOrEqual(spans[i - 1]!.to + SEAT_TURNOVER_BEATS);
        }
      }
    }
  });

  it('every visit is either served in a seat or lost without one', () => {
    const plan = planService(state);
    expect(plan.visits.length).toBeGreaterThan(0);
    for (const v of plan.visits) {
      if (v.outcome === 'served') {
        expect(v.seatIndex).not.toBeNull();
        expect(v.leaveBeat).toBeGreaterThan(v.seatBeat!);
      } else {
        expect(v.seatIndex).toBeNull();
        expect(v.leaveBeat).toBeGreaterThanOrEqual(v.arriveBeat);
      }
    }
  });

  it('a small cart queues: some customers wait before sitting', () => {
    const plan = planService(state);
    expect(plan.visits.some((v) => v.seatBeat !== null && v.seatBeat > v.arriveBeat)).toBe(true);
  });
});
