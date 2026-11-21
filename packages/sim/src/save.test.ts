import { describe, expect, it } from 'vitest';
import { autopilotRun } from './autopilot';
import { MIGRATIONS, MigrationError, migrateState } from './migrations';
import {
  EXPORT_PREFIX,
  SAVE_FORMAT,
  SaveError,
  createSave,
  exportSaveString,
  importSaveString,
  parseSave,
  serializeSave,
} from './save';
import { SIM_VERSION, createSimState } from './state';
import type { SimState } from './state';

const played = (): SimState => autopilotRun(createSimState(2026, 'cart'), 4).at(-1)!;

/** A v1 save as the sim core card wrote it: no furniture, no meta fields. */
function legacyV1(): Record<string, unknown> {
  const s = createSimState(9, 'cart') as unknown as Record<string, unknown>;
  const rest = { ...s };
  for (const key of [
    'items',
    'nextItemId',
    'menu',
    'priceAdjust',
    'stock',
    'stockSpent',
    'mastery',
    'equipment',
  ]) {
    delete rest[key];
  }
  return {
    ...rest,
    version: 1,
    unlockedRecipes: ['shoyu', 'miso', 'tonkotsu'],
    lastReport: {
      day: 1,
      customersServed: 3,
      customersLost: 2,
      revenue: 30,
      costs: 12,
      profit: 18,
      reputation: 0.5,
    },
  };
}

describe('save round-trip', () => {
  it('serialize -> parse preserves the exact state', () => {
    const state = played();
    const save = createSave(state, '2026-11-18T12:00:00.000Z');
    const back = parseSave(serializeSave(save));
    expect(back).toEqual(save);
    expect(back.state).toEqual(state);
  });

  it('export string -> import preserves the exact state', () => {
    const state = played();
    const text = exportSaveString(createSave(state, 'now'));
    expect(text.startsWith(`${EXPORT_PREFIX}.`)).toBe(true);
    expect(text).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(importSaveString(`  ${text}\n`).state).toEqual(state);
  });

  it('round-trips non-ASCII text in the envelope', () => {
    const state = played();
    const withName: SimState = {
      ...state,
      staff: {
        roster: [{ id: 1, name: 'Mochi 🍜 猫', level: 1, wage: 20, stations: 1 }],
      },
    };
    const back = importSaveString(exportSaveString(createSave(withName, 'now')));
    expect(back.state.staff.roster[0]!.name).toBe('Mochi 🍜 猫');
  });

  it('rejects tampered, truncated and foreign data with player-readable errors', () => {
    const text = exportSaveString(createSave(played(), 'now'));
    const [prefix, body, sum] = text.split('.') as [string, string, string];
    expect(() => importSaveString(`${prefix}.${body.slice(0, -4)}.${sum}`)).toThrow(/damaged/);
    expect(() => importSaveString('hello')).toThrow(SaveError);
    expect(() => importSaveString(`${prefix}.${body}!.${sum}`)).toThrow(SaveError);
    expect(() => parseSave('{nope')).toThrow(/not valid JSON/);
    expect(() => parseSave('{"format":"other"}')).toThrow(/Not a Nyan Noodle save/);
    const newer = { ...createSave(played(), 'x'), saveVersion: 99 };
    expect(() => parseSave(JSON.stringify(newer))).toThrow(/newer version/);
    const broken = { ...createSave(played(), 'x'), state: { ...played(), items: 'nope' } };
    expect(() => parseSave(JSON.stringify(broken))).toThrow(/invalid save: items/);
  });
});

describe('migrations', () => {
  it('has a step for every version below SIM_VERSION', () => {
    for (let v = 1; v < SIM_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function');
  });

  it('upgrades a v1 save to the current shape, keeping player progress', () => {
    const migrated = migrateState(legacyV1());
    expect(migrated.version).toBe(SIM_VERSION);
    expect(migrated.items.length).toBeGreaterThan(0);
    expect(migrated.nextItemId).toBe(migrated.items.length);
    expect(migrated.menu).toEqual(['shoyu', 'miso', 'tonkotsu']);
    expect(migrated.mastery).toEqual({ shoyu: 0, miso: 0, tonkotsu: 0 });
    expect(migrated.equipment).toEqual({ knives: 0, burner: 0, signboard: 0 });
    expect(migrated.seed).toBe(9);
    expect(migrated.lastReport).toMatchObject({ revenue: 30, profit: 18, tips: 0, complaints: 2 });
  });

  it('upgrades a v2 save and the result survives a normal save round-trip', () => {
    const v3 = createSimState(4, 'stall') as unknown as Record<string, unknown>;
    const v2: Record<string, unknown> = { ...v3, version: 2 };
    for (const key of ['menu', 'priceAdjust', 'stock', 'stockSpent', 'mastery', 'equipment']) {
      delete v2[key];
    }
    const migrated = migrateState(v2);
    expect(migrated.tierId).toBe('stall');
    expect(migrated.items).toEqual(createSimState(4, 'stall').items);
    expect(parseSave(serializeSave(createSave(migrated, 'x'))).state).toEqual(migrated);
  });

  it('parses an old-version save inside a current envelope', () => {
    const file = { format: SAVE_FORMAT, saveVersion: 1, savedAt: 'x', state: legacyV1() };
    expect(parseSave(JSON.stringify(file)).state.version).toBe(SIM_VERSION);
  });

  it('refuses unknown, future and malformed versions', () => {
    expect(() => migrateState(null)).toThrow(MigrationError);
    expect(() => migrateState({ version: 'x' })).toThrow(/bad state version/);
    expect(() => migrateState({ version: SIM_VERSION + 1 })).toThrow(/newer game/);
    expect(() => migrateState({ version: 0 })).toThrow(MigrationError);
  });

  it('rejects null and malformed items rather than crashing later in activeSeats', () => {
    const base = createSimState(4, 'stall') as unknown as Record<string, unknown>;
    const withItems = (items: unknown): Record<string, unknown> => ({ ...base, items });
    expect(() => migrateState(withItems([null]))).toThrow(/invalid save: items\[0\]/);
    expect(() => migrateState(withItems(['stool']))).toThrow(/invalid save: items\[0\]/);
    expect(() => migrateState(withItems([{ id: 'x', kind: 'stool', x: 0, y: 0, rot: 0 }]))).toThrow(
      /invalid save: items\[0\]/,
    );
    expect(() => migrateState(withItems([{ id: 1, kind: 'unknown', x: 0, y: 0, rot: 0 }]))).toThrow(
      /invalid save: items\[0\]/,
    );
    expect(() => migrateState(withItems([{ id: 1, kind: 'stool', x: '0', y: 0, rot: 0 }]))).toThrow(
      /invalid save: items\[0\]/,
    );
    expect(() => migrateState(withItems([{ id: 1, kind: 'stool', x: 0.5, y: 0, rot: 0 }]))).toThrow(
      /invalid save: items\[0\]/,
    );
    expect(() => migrateState(withItems([{ id: 1, kind: 'stool', x: 0, y: 1.5, rot: 0 }]))).toThrow(
      /invalid save: items\[0\]/,
    );
    expect(() => migrateState(withItems([{ id: 1, kind: 'stool', x: 0, y: 0, rot: 9 }]))).toThrow(
      /invalid save: items\[0\]/,
    );
  });
});
