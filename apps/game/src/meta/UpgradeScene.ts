import Phaser from 'phaser';
import {
  EQUIPMENT,
  MASTERY_MAX,
  MASTERY_STARS,
  RECIPES,
  RECIPE_UNLOCKS,
  STAFF_HIRE_COST,
  STAFF_HIRE_STARS,
  STAFF_LEVEL_MAX,
  STAFF_MAX,
  buyEquipment,
  describeProgressionError,
  getTier,
  hireStaff,
  levelStaff,
  masteryCost,
  staffLevelCost,
  trainMastery,
  unlockRecipe,
  cookQuality,
} from '@nyan-noodle/sim';
import type { ActionResult, RecipeId } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { catPortrait, EQUIPMENT_ICON, RECIPE_ICON, rowIcon } from './rowArt';
import { audio } from '../audio/manager';
import { SHOP_SCENE_KEY } from '../shop/ShopScene';
import { REGULARS_SCENE_KEY } from './RegularsScene';
import { session } from './session';
import { installCoach } from './coach';
import { SCENE_KEYS, backdrop, loadAtlas, messageLine, starsNumber } from './ui';

export const UPGRADE_SCENE_KEY = SCENE_KEYS.upgrades;

const RECIPE_IDS: readonly RecipeId[] = ['shoyu', 'miso', 'tonkotsu'];
const COL_W = 154;
const ROW_H = 36;
const BTN_W = 108;

/** Upgrade shop: recipes + mastery, equipment, staff cats, and the road to build mode. */
export class UpgradeScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private msg!: ReturnType<typeof messageLine>;
  /** Keeps every hired cat reachable: the sim allows five, but only three rows fit at once. */
  private staffPage = 0;

  constructor() {
    super(UPGRADE_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    audio.setMusicMode('prep');
    backdrop(this);
    this.msg = messageLine(this, NATIVE_HEIGHT - 38);
    this.render();
    installCoach(this, 'upgrades', session.coach);
    this.exposeDebugApi();
    this.registry.set('upgradesReady', true);
    this.events.once('shutdown', () => this.registry.set('upgradesReady', false));
  }

  private apply(result: ActionResult, done: string): void {
    if (!result.ok) return this.msg.say(describeProgressionError(result.reason), false);
    session.update(result.state);
    this.msg.say(done);
    void session.save().catch(() => undefined);
    this.render();
  }

  private render(): void {
    for (const o of this.dynamic) o.destroy();
    const before = new Set(this.children.list);
    this.draw();
    this.dynamic = this.children.list.filter((o) => !before.has(o) && !o.getData('nyanCoach'));
  }

  /** Atlas icon plus two text lines above a full-width action button: no overlap. */
  private row(
    x: number,
    y: number,
    title: string,
    detail: string,
    label: string,
    gated: boolean,
    onClick: () => void,
    frame: string,
    cropHeight?: number,
  ): void {
    rowIcon(this, x, y, frame, cropHeight);
    pixelText(this, x + 20, y, title);
    pixelText(this, x + 20, y + 11, detail, { token: 'slate' }).setData('nyanRowDetail', true);
    const b = createButton(this, x + 20, y + 23, BTN_W, 12, label, onClick);
    b.container.setData('nyanRowButton', true);
    b.setDim(gated);
  }

  private draw(): void {
    const s = session.state;
    const rep = s.economy.reputation;
    const tier = getTier(s.tierId);
    pixelText(this, 8, 6, 'Upgrade shop', { token: 'lanternYellow', scale: 2 });
    pixelText(
      this,
      NATIVE_WIDTH - 8,
      8,
      `${tier.name}   ${s.economy.fishCoins} coins   ${starsNumber(rep)}/5`,
      { token: 'cream', originX: 1 },
    );

    // ---- recipes -----------------------------------------------------------------
    const rp = drawPanel(this, 6, 26, COL_W + 8, 178, { title: 'Recipes & mastery' });
    let y = rp.content.y + 3;
    for (const id of RECIPE_IDS) {
      const x = rp.content.x + 3;
      if (!s.unlockedRecipes.includes(id)) {
        const g = RECIPE_UNLOCKS[id];
        this.row(
          x,
          y,
          RECIPES[id].name,
          `Needs ${g.stars} stars`,
          `Unlock ${g.cost}c`,
          rep < g.stars || s.economy.fishCoins < g.cost,
          () => this.apply(unlockRecipe(session.state, id), `${RECIPES[id].name} unlocked!`),
          RECIPE_ICON[id],
        );
      } else {
        const level = s.mastery[id];
        const stars = MASTERY_STARS[level] ?? 99;
        const detail = `Mastery ${level}/${MASTERY_MAX}  q${cookQuality(s, false, id)}`;
        const label = level >= MASTERY_MAX ? 'Max' : `Train ${masteryCost(level)}c`;
        this.row(
          x,
          y,
          RECIPES[id].name,
          detail,
          label,
          level < MASTERY_MAX && (rep < stars || s.economy.fishCoins < masteryCost(level)),
          () => this.apply(trainMastery(session.state, id), `${RECIPES[id].name} mastery up!`),
          RECIPE_ICON[id],
        );
      }
      y += ROW_H + 4;
    }

    // ---- equipment --------------------------------------------------------------
    const ep = drawPanel(this, 6 + COL_W + 12, 26, COL_W + 8, 178, { title: 'Equipment' });
    y = ep.content.y + 3;
    for (const def of EQUIPMENT) {
      const level = s.equipment[def.id];
      const maxed = level >= def.maxLevel;
      const cost = def.costs[level] ?? 0;
      const need = def.stars[level] ?? 99;
      this.row(
        ep.content.x + 3,
        y,
        `${def.name} L${level}`,
        maxed ? def.blurb : `${def.blurb} (${need} stars)`,
        maxed ? 'Max' : `Buy ${cost}c`,
        !maxed && (rep < need || s.economy.fishCoins < cost),
        () => this.apply(buyEquipment(session.state, def.id), `${def.name} upgraded!`),
        EQUIPMENT_ICON[def.id],
      );
      y += ROW_H + 4;
    }
    const goBuild = createButton(
      this,
      ep.content.x + 3,
      y + 2,
      COL_W - 4,
      16,
      'Build / expand shop',
      () => {
        void session.save().catch(() => undefined);
        this.scene.start(SHOP_SCENE_KEY, { session: true, mode: 'build' });
      },
    );
    goBuild.setDim(false);

    // ---- staff ---------------------------------------------------------------------
    const perPage = 3;
    const count = s.staff.roster.length;
    const pages = Math.max(1, Math.ceil(count / perPage));
    this.staffPage = Math.min(this.staffPage, pages - 1);
    const lastPage = this.staffPage === pages - 1;
    const pageTag = pages > 1 ? ` ${this.staffPage + 1}/${pages}` : '';
    const sp = drawPanel(this, 6 + 2 * (COL_W + 12), 26, COL_W + 8 - 26, 178, {
      title: `Staff cats (${count})${pageTag}`,
    });
    y = sp.content.y + 3;
    const sx = sp.content.x + 3;
    const start = this.staffPage * perPage;
    for (const member of s.staff.roster.slice(start, start + perPage)) {
      const cost = staffLevelCost(member.level);
      const maxed = member.level >= STAFF_LEVEL_MAX;
      const coat = (['tabby', 'grey', 'black', 'white'] as const)[member.id % 4]!;
      rowIcon(this, sx, y, catPortrait(coat), 12);
      pixelText(this, sx + 20, y, `${member.name} L${member.level}`);
      pixelText(this, sx + 20, y + 11, `wage ${member.wage}c  q~${cookQuality(s, true, 'shoyu')}`, {
        token: 'slate',
      }).setData('nyanRowDetail', true);
      const b = createButton(this, sx + 20, y + 23, 80, 12, maxed ? 'Max' : `Level ${cost}c`, () =>
        this.apply(levelStaff(session.state, member.id), `${member.name} levelled up!`),
      );
      b.container.setData('nyanRowButton', true);
      b.container.setData('nyanLevelButton', member.id);
      b.setDim(!maxed && s.economy.fishCoins < cost);
      y += ROW_H + 2;
    }
    // The hire row belongs on the last page, where the new cat appears.
    if (lastPage) {
      if (count < STAFF_MAX) {
        const need = STAFF_HIRE_STARS[count] ?? 99;
        rowIcon(this, sx, y, 'icon/heart');
        pixelText(this, sx + 20, y, 'Hire a staff cat');
        pixelText(this, sx + 20, y + 11, `Needs ${need} stars`, { token: 'slate' }).setData(
          'nyanRowDetail',
          true,
        );
        const b = createButton(this, sx + 20, y + 23, 80, 12, `Hire ${STAFF_HIRE_COST}c`, () => {
          this.staffPage = Math.floor(count / perPage); // the new cat lands on this page
          this.apply(hireStaff(session.state), 'A new cat joins the kitchen!');
        });
        b.container.setData('nyanRowButton', true);
        b.setDim(rep < need || s.economy.fishCoins < STAFF_HIRE_COST);
      } else {
        pixelText(this, sx, y, 'Kitchen is full', { token: 'slate' });
      }
      y += ROW_H + 2;
    }
    if (pages > 1) {
      const prev = createButton(this, sx, y, 56, 12, 'Prev', () => {
        this.staffPage = Math.max(0, this.staffPage - 1);
        this.render();
      });
      prev.container.setData('nyanRowButton', true);
      prev.setDim(this.staffPage === 0);
      const next = createButton(this, sx + 60, y, 56, 12, 'Next', () => {
        this.staffPage = Math.min(pages - 1, this.staffPage + 1);
        this.render();
      });
      next.container.setData('nyanRowButton', true);
      next.setDim(lastPage);
    }

    createButton(this, 6, NATIVE_HEIGHT - 26, 90, 18, 'Back to prep', () =>
      this.scene.start(SCENE_KEYS.prep),
    );
    createButton(this, 100, NATIVE_HEIGHT - 26, 90, 18, 'Regulars', () =>
      this.scene.start(REGULARS_SCENE_KEY),
    );
    pixelText(this, NATIVE_WIDTH - 8, NATIVE_HEIGHT - 22, `Day ${s.clock.day} next`, {
      token: 'cream',
      originX: 1,
    });
  }

  private exposeDebugApi(): void {
    const api = {
      state: () => JSON.parse(JSON.stringify(session.state)) as unknown,
      unlock: (id: RecipeId) => this.apply(unlockRecipe(session.state, id), 'ok'),
      train: (id: RecipeId) => this.apply(trainMastery(session.state, id), 'ok'),
      hire: () => this.apply(hireStaff(session.state), 'ok'),
      prep: () => this.scene.start(SCENE_KEYS.prep),
      /**
       * Native-pixel boxes for the detail text and action buttons. Exposed so e2e can
       * prove they never intersect at any viewport size.
       */
      layout: () => {
        const box = (o: Phaser.GameObjects.GameObject) => {
          const b = (o as Phaser.GameObjects.Text).getBounds();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        };
        return {
          details: this.children.list.filter((o) => o.getData('nyanRowDetail') === true).map(box),
          buttons: this.children.list.filter((o) => o.getData('nyanRowButton') === true).map(box),
          /** Staff ids with a Level button on the current page. */
          levels: this.children.list
            .filter((o) => o.getData('nyanLevelButton') !== undefined)
            .map((o) => o.getData('nyanLevelButton') as number),
        };
      },
    };
    (window as unknown as { __nyanUpgrades: typeof api }).__nyanUpgrades = api;
  }
}
