import { createSave, createSimState, exportSaveString, importSaveString } from '@nyan-noodle/sim';
import type { SaveFile, SimState } from '@nyan-noodle/sim';
import { type SaveStore, createDefaultStore } from './storage';

export interface SaveSummary {
  readonly day: number;
  readonly tierId: SimState['tierId'];
  readonly fishCoins: number;
  readonly reputation: number;
  readonly savedAt: string;
}

export function summarize(save: SaveFile): SaveSummary {
  const s = save.state;
  return {
    day: s.clock.day,
    tierId: s.tierId,
    fishCoins: s.economy.fishCoins,
    reputation: s.economy.reputation,
    savedAt: save.savedAt,
  };
}

/** The player's current run: one SimState plus the save slot behind it. */
export class Session {
  private current: SimState | null = null;
  /** Last save-slot problem, shown on the title screen. */
  lastError: string | null = null;

  /**
   * Secondary-corruption warning from the last read: a valid save was returned, but another
   * backend held an unparseable copy. Shown on the title screen separately from load errors
   * (it does not disable Continue); the next autosave repairs the secondary copy.
   */
  lastWarning: string | null = null;

  constructor(readonly store: SaveStore = createDefaultStore()) {}

  get state(): SimState {
    if (!this.current) throw new Error('No game in progress');
    return this.current;
  }

  get active(): boolean {
    return this.current !== null;
  }

  /** Peek at the stored save without loading it. */
  async peek(): Promise<SaveSummary | null> {
    try {
      const save = await this.store.read();
      this.lastError = null;
      this.lastWarning = this.store.lastWarning;
      return save ? summarize(save) : null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.lastWarning = null;
      return null;
    }
  }

  async continueGame(): Promise<boolean> {
    const save = await this.store.read();
    if (!save) return false;
    this.current = save.state;
    return true;
  }

  newGame(seed: number = Date.now() % 2_147_483_647): SimState {
    this.current = createSimState(seed || 1, 'cart');
    return this.current;
  }

  /** Replace the live state (every action in a scene funnels through here). */
  update(next: SimState): void {
    this.current = next;
  }

  async save(): Promise<void> {
    await this.store.write(createSave(this.state, new Date().toISOString()));
  }

  exportString(): string {
    return exportSaveString(createSave(this.state, new Date().toISOString()));
  }

  /** Validate an export string and make it the live game (call save() to persist). */
  importString(text: string): SimState {
    this.current = importSaveString(text).state;
    return this.current;
  }

  async erase(): Promise<void> {
    await this.store.clear();
  }
}

export const session = new Session();
