import Phaser from 'phaser';
import { getTier } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import type { ButtonHandle } from '../theme/hud';
import { ATLAS_KEY, catAnimKey, createCatAnimations } from '../shop/CatActor';
import { session } from './session';
import type { SaveSummary } from './session';
import { SCENE_KEYS, backdrop, loadAtlas, messageLine, starsText } from './ui';

export const TITLE_SCENE_KEY = SCENE_KEYS.title;

/** Title screen: Continue / New Game / Import / Export. */
export class TitleScene extends Phaser.Scene {
  private summary: SaveSummary | null = null;
  private armedNewGame = false;
  private msg!: ReturnType<typeof messageLine>;
  private newButton!: ButtonHandle;

  constructor() {
    super(TITLE_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    this.armedNewGame = false;
    backdrop(this);
    createCatAnimations(this);
    pixelText(this, NATIVE_WIDTH / 2, 28, 'NYAN NOODLE', {
      scale: 3,
      token: 'lanternYellow',
      originX: 0.5,
    });
    pixelText(this, NATIVE_WIDTH / 2, 58, 'a cozy cat ramen shop', {
      token: 'paperPink',
      originX: 0.5,
    });
    this.decorate();
    this.msg = messageLine(this, 212);
    this.registry.set('titleReady', false);
    void session.peek().then((summary) => {
      this.summary = summary;
      this.buildMenu();
      if (session.lastError) this.msg.say(`Save problem: ${session.lastError}`, false);
      this.registry.set('titleReady', true);
    });
    this.exposeDebugApi();
  }

  private decorate(): void {
    const y = 176;
    for (const [x, coat] of [
      [150, 'tabby'],
      [330, 'grey'],
    ] as const) {
      const cat = this.add.sprite(x, y, ATLAS_KEY).setOrigin(0.5, 1).setScale(2);
      cat.play(catAnimKey(coat, 'down', 'idle'));
    }
    this.add.image(NATIVE_WIDTH / 2, y - 6, ATLAS_KEY, 'food/bowl_shoyu').setScale(2);
  }

  private buildMenu(): void {
    const { content } = drawPanel(this, 164, 78, 152, 120, { title: 'Menu' });
    const x = content.x + 6;
    const w = content.width - 12;
    let y = content.y + 6;
    const add = (label: string, onClick: () => void): ButtonHandle => {
      const b = createButton(this, x, y, w, 18, label, onClick);
      y += 22;
      return b;
    };
    const s = this.summary;
    const cont = add(s ? 'Continue' : 'Continue (no save)', () => void this.continueGame());
    cont.setDim(!s);
    this.newButton = add('New game', () => this.newGame());
    add('Import save', () => this.importSave());
    const exp = add('Export save', () => void this.exportSave());
    exp.setDim(!s);
    if (s) {
      pixelText(
        this,
        NATIVE_WIDTH / 2,
        204,
        `Day ${s.day} - ${getTier(s.tierId).name} - ${s.fishCoins}c - ${starsText(s.reputation)} stars`,
        { token: 'cream', originX: 0.5 },
      );
    }
    pixelText(this, NATIVE_WIDTH / 2, NATIVE_HEIGHT - 12, 'Saves live in this browser only', {
      token: 'stone',
      originX: 0.5,
    });
  }

  private async continueGame(): Promise<void> {
    try {
      if (!(await session.continueGame())) return this.msg.say('No saved game yet', false);
      this.scene.start(SCENE_KEYS.prep);
    } catch (error) {
      this.msg.say(error instanceof Error ? error.message : 'Could not load the save', false);
    }
  }

  private newGame(): void {
    // A stored save OR a load error (damaged/newer-version save still on disk) both mean a
    // destructive replace, so require the second click in both cases.
    const hasExisting = this.summary !== null || session.lastError !== null;
    if (hasExisting && !this.armedNewGame) {
      this.armedNewGame = true;
      this.newButton.setLabel('Erase & start?');
      return this.msg.say('Click again to replace the saved game', false);
    }
    session.newGame();
    void session.save().catch(() => undefined);
    this.scene.start(SCENE_KEYS.prep);
  }

  private importSave(): void {
    const text = window.prompt('Paste your Nyan Noodle export string');
    if (!text) return;
    try {
      session.importString(text);
      void session.save().catch(() => undefined);
      this.scene.start(SCENE_KEYS.prep);
    } catch (error) {
      this.msg.say(error instanceof Error ? error.message : 'Import failed', false);
    }
  }

  private async exportSave(): Promise<void> {
    // Export the live session when there is one (it is newer than the stored save after an
    // autosave failure); otherwise load the stored save to export.
    if (session.active) {
      this.copyExport(session.exportString());
      return;
    }
    try {
      if (!(await session.continueGame())) return this.msg.say('Nothing to export yet', false);
    } catch (error) {
      return this.msg.say(error instanceof Error ? error.message : 'Export failed', false);
    }
    this.copyExport(session.exportString());
  }

  private async copyExport(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.msg.say('Export string copied to clipboard');
    } catch {
      window.prompt('Copy your export string', text);
    }
  }

  private exposeDebugApi(): void {
    const api = {
      summary: () => this.summary,
      continueGame: () => this.continueGame(),
      newGame: () => this.newGame(),
    };
    (window as unknown as { __nyanTitle: typeof api }).__nyanTitle = api;
  }
}
