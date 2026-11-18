import { describe, expect, it } from 'vitest';
import { CHEF_TICKETS, chefTickets } from './chef';
import { settleDay } from './day';
import { salePrice } from './prep';
import { planService } from './service';
import { createSimState } from './state';

describe('chef tickets (hand-cooked bowls in the day loop)', () => {
  const s = { ...createSimState(77, 'cart'), stock: 20 };
  const plan = planService(s);

  it('are the first seated cats, priced at the day sale price, and deterministic', () => {
    const tickets = chefTickets(s, plan);
    expect(tickets).toHaveLength(CHEF_TICKETS);
    for (const t of tickets) {
      const visit = plan.visits[t.visitIndex]!;
      expect(visit.outcome).toBe('served');
      expect(t.order.recipeId).toBe(visit.recipeId);
      expect(t.order.price).toBe(salePrice(s, visit.recipeId));
    }
    expect(JSON.stringify(chefTickets(s, plan))).toBe(JSON.stringify(tickets));
  });

  it('hand-cooked quality drives tips and reputation; skipped tickets keep the model', () => {
    const modelled = settleDay(s, plan).report;
    const skipped = settleDay(s, plan, { chefQualities: [null, null, null] }).report;
    expect(skipped).toEqual(modelled);

    const perfect = settleDay(s, plan, { chefQualities: [100, 100, 100] }).report;
    const burnt = settleDay(s, plan, { chefQualities: [10, 10, 10] }).report;
    expect(perfect.tips).toBeGreaterThan(burnt.tips);
    expect(perfect.reputation).toBeGreaterThan(burnt.reputation);
    // Revenue is the sale price either way; only tips and stars react to quality.
    expect(perfect.revenue).toBe(burnt.revenue);
    expect(perfect.customersServed).toBe(modelled.customersServed);
  });
});
