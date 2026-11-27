import Phaser from 'phaser';
import {
  NEIGHBOUR_PANTRY_BOWLS,
  PRICE_STEP,
  RECIPES,
  RECIPE_UNLOCKS,
  STOCK_BOWL_COST,
  adjustPrice,
  buyStock,
  describeProgressionError,
  effectiveMenu,
  getTier,
  neighbourPantry,
  openingPending,
  pantryOffer,
  playerCapacity,
  salePrice,
  staffCapacity,
  stockCap,
  toggleMenu,
} from '@nyan-noodle/sim';
import type { ActionResult, RecipeId } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PANEL_TEXT } from '../theme/palette';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { rowIcon } from './rowArt';
import { audio } from '../audio/manager';
import { SERVICE_SCENE_KEY } from '../service/ServiceScene';
import { drawGoalsPanel, exposeGoalsApi } from './goalsPanel';
import { session } from './session';
import { installCoach } from './coach';
import { SCENE_KEYS, backdrop, loadAtlas, messageLine, starsNumber } from './ui';
import { ATLAS_KEY } from '../shop/CatActor';

export const PREP_SCENE_KEY = SCENE_KEYS.prep;

const RECIPE_IDS: readonly RecipeId[] = ['shoyu', 'miso', 'tonkotsu'];
const ROW_H = 30;

/** Prep phase: choose the menu, set prices, buy stock, then open the shop. */
export class PrepScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private msg!: ReturnType<typeof messageLine>;

  constructor() {
    super(PREP_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    // Continue/import and Report -> Upgrades -> Back can reach Prep without going through
    // ReportScene.next(). A saved pending celebration must still be shown before any Prep
    // controls (or a new service) can skip it.
    if (openingPending(session.state)) {
      this.scene.start(SCENE_KEYS.milestone);
      return;
    }
    audio.setMusicMode('prep');
    backdrop(this);
    this.msg = messageLine(this, NATIVE_HEIGHT - 38);
    this.render();
    installCoach(this, 'prep', session.coach);
    this.exposeDebugApi();
    exposeGoalsApi();
    this.registry.set('prepReady', true);
    this.events.once('shutdown', () => this.registry.set('prepReady', false));
  }

  private apply(result: ActionResult): void {
    if (!result.ok) return this.msg.say(describeProgressionError(result.reason), false);
    session.update(result.state);
    this.msg.say('');
    this.render();
  }

  private render(): void {
    for (const o of this.dynamic) o.destroy();
    const before = new Set(this.children.list);
    this.draw();
    this.dynamic = this.children.list.filter((o) => !before.has(o) && !o.getData('nyanCoach'));
  }

  private draw(): void {
    const s = session.state;
    const tier = getTier(s.tierId);
    const menu = effectiveMenu(s);

    pixelText(this, 8, 6, `Day ${s.clock.day} - Prep`, { token: 'lanternYellow', scale: 2 });
    pixelText(
      this,
      NATIVE_WIDTH - 8,
      8,
      `${tier.name}   ${s.economy.fishCoins} coins   ${starsNumber(s.economy.reputation)}/5`,
      { token: 'cream', originX: 1 },
    );

    // ---- menu & prices -------------------------------------------------------
    const menuPanel = drawPanel(this, 6, 26, 292, 128, { title: 'Menu & prices' });
    let y = menuPanel.content.y + 4;
    for (const id of RECIPE_IDS) {
      this.recipeRow(id, menuPanel.content.x + 4, y, menu.includes(id));
      y += ROW_H;
    }

    // ---- stock & kitchen -----------------------------------------------------
    const stockPanel = drawPanel(this, 304, 26, 170, 128, { title: 'Stock & kitchen' });
    const cx = stockPanel.content.x + 4;
    let sy = stockPanel.content.y + 4;
    const cap = stockCap(s.tierId);
    rowIcon(this, cx, sy, 'food/bowl_empty');
    pixelText(this, cx + 20, sy, `Stock: ${s.stock}/${cap} bowls`);
    sy += 11;
    rowIcon(this, cx, sy, 'icon/coin');
    pixelText(this, cx + 20, sy, `Ingredients ${STOCK_BOWL_COST}c per bowl`, { token: 'slate' });
    sy += 13;
    const buy = (n: number, label: string, x: number): void => {
      createButton(this, x, sy, 48, 16, label, () => this.apply(buyStock(session.state, n)));
    };
    buy(5, 'Buy 5', cx);
    buy(10, 'Buy 10', cx + 52);
    buy(cap, 'Fill', cx + 104);
    sy += 24;
    const staffN = s.staff.roster.length;
    rowIcon(this, cx, sy, 'icon/flame');
    pixelText(this, cx + 20, sy, `You cook ${playerCapacity(s)} bowls/day`);
    sy += 11;
    rowIcon(this, cx, sy, 'icon/heart');
    pixelText(
      this,
      cx + 20,
      sy,
      staffN > 0 ? `${staffN} staff cook ${staffCapacity(s)} more` : 'No staff hired yet',
      {
        token: 'slate',
      },
    );
    sy += 11;
    if (pantryOffer(s)) {
      rowIcon(this, cx, sy, 'furniture/sign', 12);
      pixelText(this, cx + 20, sy, "Neighbour's pantry:", { token: PANEL_TEXT.gold });
      sy += 11;
      createButton(this, cx, sy, 150, 16, `Take ${NEIGHBOUR_PANTRY_BOWLS} free bowls`, () =>
        this.apply(neighbourPantry(session.state)),
      );
    } else {
      pixelText(this, cx, sy, `Seats: ${tier.seats} max`, { token: 'slate' });
    }

    // ---- goals -----------------------------------------------------------------
    drawGoalsPanel(this, 6, 158, NATIVE_WIDTH - 12, 68, s);

    // ---- footer ----------------------------------------------------------------
    createButton(this, 6, NATIVE_HEIGHT - 26, 90, 18, 'Upgrades', () =>
      this.scene.start(SCENE_KEYS.upgrades),
    );
    createButton(this, 102, NATIVE_HEIGHT - 26, 60, 18, 'Title', () => {
      void session.save().catch(() => undefined);
      this.scene.start(SCENE_KEYS.title);
    });
    createButton(this, NATIVE_WIDTH - 126, NATIVE_HEIGHT - 26, 120, 18, 'Open the shop!', () => {
      if (s.stock <= 0) {
        return this.msg.say(
          pantryOffer(s)
            ? "Broke and out of stock - take the neighbour's pantry"
            : 'Buy some stock first - bowls need ingredients',
          false,
        );
      }
      void session.save().catch(() => undefined);
      this.scene.start(SERVICE_SCENE_KEY, { session: true });
    });
  }

  private recipeRow(id: RecipeId, x: number, y: number, on: boolean): void {
    const s = session.state;
    const recipe = RECIPES[id];
    const owned = s.unlockedRecipes.includes(id);
    this.add
      .image(x, y, ATLAS_KEY, `food/bowl_${id}`)
      .setOrigin(0, 0)
      .setAlpha(owned ? 1 : 0.35);
    if (!owned) {
      const gate = RECIPE_UNLOCKS[id];
      pixelText(this, x + 22, y + 1, recipe.name, { token: 'slate' });
      pixelText(this, x + 22, y + 12, `Locked: ${gate.stars} stars + ${gate.cost}c`, {
        token: 'chiliRed',
      });
      return;
    }
    createButton(this, x + 22, y, 30, 14, on ? 'On' : 'Off', () =>
      this.apply(toggleMenu(session.state, id)),
    );
    pixelText(this, x + 58, y + 1, recipe.name);
    const adj = s.priceAdjust[id];
    const pct = Math.round(adj * PRICE_STEP * 100);
    pixelText(
      this,
      x + 58,
      y + 12,
      `Mastery ${s.mastery[id]}  ${pct >= 0 ? '+' : ''}${pct}% price`,
      {
        token: 'slate',
      },
    );
    pixelText(this, x + 176, y + 1, `${salePrice(s, id)}c`, { token: PANEL_TEXT.gold, scale: 2 });
    createButton(this, x + 214, y, 16, 14, '-', () =>
      this.apply(adjustPrice(session.state, id, -1)),
    );
    createButton(this, x + 234, y, 16, 14, '+', () =>
      this.apply(adjustPrice(session.state, id, 1)),
    );
  }

  private exposeDebugApi(): void {
    const api = {
      state: () => JSON.parse(JSON.stringify(session.state)) as unknown,
      buy: (n: number) => this.apply(buyStock(session.state, n)),
      toggle: (id: RecipeId) => this.apply(toggleMenu(session.state, id)),
      price: (id: RecipeId, d: number) => this.apply(adjustPrice(session.state, id, d)),
      pantry: () => this.apply(neighbourPantry(session.state)),
      offer: () => pantryOffer(session.state),
      /** Test hook: force the dead-end state (empty pantry, no coins) and redraw. */
      forceBroke: () => {
        const s = session.state;
        session.update({ ...s, stock: 0, economy: { ...s.economy, fishCoins: 0 } });
        this.render();
      },
      openShop: () => this.scene.start(SERVICE_SCENE_KEY, { session: true }),
      upgrades: () => this.scene.start(SCENE_KEYS.upgrades),
    };
    (window as unknown as { __nyanPrep: typeof api }).__nyanPrep = api;
  }
}
