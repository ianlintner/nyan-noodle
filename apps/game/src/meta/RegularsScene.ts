import Phaser from 'phaser';
import { BREEDS, TRAITS, regularPerks } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PANEL_TEXT } from '../theme/palette';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';
import { session } from './session';
import { SCENE_KEYS, backdrop, loadAtlas } from './ui';
import type { Regular } from '@nyan-noodle/sim';

export const REGULARS_SCENE_KEY = 'RegularsScene';

const ROW_H = 34;
/** Rows shown per page — keeps the list from running off-screen as the roster grows. */
const ROWS_PER_PAGE = 5;
/** Hearts shown on the meter are capped at 5 (affection itself runs 0..MAX_AFFECTION). */
const MAX_HEARTS = 5;

/**
 * The regulars journal: every cat who has become a regular, with their name, look,
 * trait, favourite dish, visits and affection. Read-only — it just replays the roster
 * the sim built up in `SimState.regulars`. No session edits, so it mirrors with a
 * single `session.update`-free render. Roster is paged so a long list never overlaps
 * the footer buttons.
 */
export class RegularsScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private page = 0;

  constructor() {
    super(REGULARS_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    backdrop(this);
    this.page = 0;
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
    // Most-devoted first; page through the rest so long rosters stay readable.
    const regulars: Regular[] = [...s.regulars].sort((a, b) => b.affection - a.affection);
    const pages = Math.max(1, Math.ceil(regulars.length / ROWS_PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const start = this.page * ROWS_PER_PAGE;
    const visible = regulars.slice(start, start + ROWS_PER_PAGE);

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
        { token: 'ink' },
      );
    } else {
      let y = panel.content.y + 3;
      const xs = panel.content.x + 3;
      for (const reg of visible) {
        const coat = reg.coat === 'sakura' ? 'white' : reg.coat;
        const portrait = this.add
          .image(xs + 10, y + 14, ATLAS_KEY, `cat/${coat}/down/idle_0`)
          .setOrigin(0.5, 1)
          .setCrop(0, 0, 16, 12)
          .setScale(0.85);
        const breed = BREEDS[reg.breed]?.name ?? reg.breed;
        const trait = TRAITS[reg.trait]?.name ?? reg.trait;
        const perks = regularPerks(reg);
        pixelText(this, xs + 22, y, reg.name, { token: 'ink' });
        pixelText(this, xs + 22, y + 10, `${breed} · ${trait} · loves ${reg.favoriteRecipe}`, {
          token: 'slate',
        });
        const affection = `${'♥'.repeat(Math.min(reg.affection, MAX_HEARTS))}${reg.affection}`;
        pixelText(
          this,
          xs + 22,
          y + 20,
          `${reg.visits} visits  ${affection}  perk +${perks.tipBonus}c`,
          { token: PANEL_TEXT.gold },
        );
        pixelText(this, NATIVE_WIDTH - 20, y + 10, `day ${reg.lastSeenDay}`, {
          token: 'slate',
          originX: 1,
        });
        y += ROW_H;
        void portrait;
      }
    }

    // Pager — only shown when there is more than one page.
    if (pages > 1) {
      const pagerY = panel.content.y + panel.content.height - 12;
      pixelText(
        this,
        panel.content.x + 4,
        pagerY,
        `Page ${this.page + 1}/${pages}  (${regulars.length} cats)`,
        { token: 'slate' },
      );
      if (this.page > 0) {
        createButton(this, NATIVE_WIDTH - 96, pagerY - 4, 40, 14, '< Prev', () => {
          this.page -= 1;
          this.render();
        });
      }
      if (this.page < pages - 1) {
        createButton(this, NATIVE_WIDTH - 52, pagerY - 4, 40, 14, 'Next >', () => {
          this.page += 1;
          this.render();
        });
      }
    }

    createButton(this, 6, NATIVE_HEIGHT - 30, 90, 18, 'Back to prep', () =>
      this.scene.start(SCENE_KEYS.prep),
    );
  }
}
