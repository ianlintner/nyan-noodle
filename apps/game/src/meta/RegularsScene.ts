import Phaser from 'phaser';
import { BREEDS, TRAITS, regularPerks } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';
import { session } from './session';
import { SCENE_KEYS, backdrop, loadAtlas } from './ui';

export const REGULARS_SCENE_KEY = 'RegularsScene';

const ROW_H = 34;

/**
 * The regulars journal: every cat who has become a regular, with their name, look,
 * trait, favourite dish, visits and affection. Read-only — it just replays the roster
 * the sim built up in `SimState.regulars`. No session edits, so it mirrors with a
 * single `session.update`-free render.
 */
export class RegularsScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(REGULARS_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    backdrop(this);
    this.render();
    this.registry.set('regularsReady', true);
    this.events.once('shutdown', () => this.registry.set('regularsReady', false));
  }

  private render(): void {
    for (const o of this.dynamic) o.destroy();
    const before = new Set(this.children.list);
    this.draw();
    this.dynamic = this.children.list.filter((o) => !before.has(o));
  }

  private draw(): void {
    const s = session.state;
    const regulars = [...s.regulars].sort((a, b) => b.affection - a.affection);
    pixelText(this, 8, 6, 'Regulars', { token: 'lanternYellow', scale: 2 });
    pixelText(this, NATIVE_WIDTH - 8, 8, `Day ${s.clock.day}`, {
      token: 'cream',
      originX: 1,
    });

    const panel = drawPanel(this, 6, 26, NATIVE_WIDTH - 12, NATIVE_HEIGHT - 64, {
      title: 'Familiar faces',
    });

    if (regulars.length === 0) {
      pixelText(
        this,
        panel.content.x + 4,
        panel.content.y + 8,
        'No regulars yet. Serve a good bowl\nand a cat may come back tomorrow.',
        { token: 'slate' },
      );
    } else {
      let y = panel.content.y + 3;
      const xs = panel.content.x + 3;
      for (const reg of regulars) {
        const coat = reg.coat === 'sakura' ? 'white' : reg.coat;
        const portrait = this.add
          .image(xs + 10, y + 14, ATLAS_KEY, `cat/${coat}/down/idle_0`)
          .setOrigin(0.5, 1)
          .setCrop(0, 0, 16, 12)
          .setScale(0.85);
        const breed = BREEDS[reg.breed]?.name ?? reg.breed;
        const trait = TRAITS[reg.trait]?.name ?? reg.trait;
        const perks = regularPerks(reg);
        pixelText(this, xs + 22, y, reg.name, { token: 'cream' });
        pixelText(this, xs + 22, y + 10, `${breed} · ${trait} · loves ${reg.favoriteRecipe}`, {
          token: 'slate',
        });
        const affection = `${'♥'.repeat(Math.min(reg.affection, 5))}${reg.affection}`;
        pixelText(
          this,
          xs + 22,
          y + 20,
          `${reg.visits} visits  ${affection}  perk +${perks.tipBonus}c`,
          { token: 'brothGold' },
        );
        pixelText(this, NATIVE_WIDTH - 20, y + 10, `day ${reg.lastSeenDay}`, {
          token: 'slate',
          originX: 1,
        });
        y += ROW_H;
        void portrait;
      }
    }

    createButton(this, 6, NATIVE_HEIGHT - 30, 90, 18, 'Back to prep', () =>
      this.scene.start(SCENE_KEYS.prep),
    );
  }
}
