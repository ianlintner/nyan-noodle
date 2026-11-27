import Phaser from 'phaser';
import { acknowledgeOpening, getTier, openingPending, openingStats } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { audio } from '../audio/manager';
import { exposeGoalsApi } from './goalsPanel';
import { session } from './session';
import { SCENE_KEYS, backdrop, icon, loadAtlas, messageLine } from './ui';

export const MILESTONE_SCENE_KEY = SCENE_KEYS.milestone;

/** "Grand Opening": shown once per save when the top tier reaches full stars. */
export class MilestoneScene extends Phaser.Scene {
  private msg!: ReturnType<typeof messageLine>;
  private confirming = false;

  constructor() {
    super(MILESTONE_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    this.confirming = false;
    if (!openingPending(session.state)) {
      this.scene.start(SCENE_KEYS.prep);
      return;
    }
    audio.setMusicMode('prep');
    backdrop(this);
    this.msg = messageLine(this, NATIVE_HEIGHT - 38);
    this.draw();
    exposeGoalsApi();
    this.exposeDebugApi();
    this.registry.set('milestoneReady', true);
    this.events.once('shutdown', () => this.registry.set('milestoneReady', false));
  }

  private draw(): void {
    const state = session.state;
    const stats = openingStats(state);
    pixelText(this, NATIVE_WIDTH / 2, 8, 'Grand Opening!', {
      scale: 3,
      token: 'lanternYellow',
      originX: 0.5,
    });
    const panel = drawPanel(this, 90, 44, 300, 142, { title: getTier(state.tierId).name });
    const cx = panel.content.x + panel.content.width / 2;
    let y = panel.content.y + 6;
    icon(this, cx - 8, y, 'star');
    y += 20;
    pixelText(this, cx, y, 'Five stars! The whole district', { originX: 0.5 });
    y += 10;
    pixelText(this, cx, y, 'is purring about your ramen.', { originX: 0.5 });
    y += 18;
    const row = (label: string, value: string): void => {
      pixelText(this, panel.content.x + 24, y, label, { token: 'slate' });
      pixelText(this, panel.content.x + panel.content.width - 24, y, value, { originX: 1 });
      y += 13;
    };
    row('Days open', `${stats.days}`);
    row('Bowls served', `${stats.bowlsServed}`);
    row(
      'Best regular',
      stats.bestRegular
        ? `${stats.bestRegular.name} (${stats.bestRegular.affection}/10)`
        : 'none yet',
    );

    createButton(this, 90, NATIVE_HEIGHT - 26, 120, 18, 'Keep playing', () => this.keepPlaying());
    const fresh = createButton(this, 270, NATIVE_HEIGHT - 26, 120, 18, 'New shop', () => {
      if (!this.confirming) {
        this.confirming = true;
        fresh.setLabel('Sure? Erases');
        this.msg.say('Start over from a Cart? Press again to erase this shop.', false);
        return;
      }
      this.newShop();
    });
  }

  private keepPlaying(): void {
    session.update(acknowledgeOpening(session.state));
    void session.save().catch(() => undefined);
    this.scene.start(SCENE_KEYS.prep);
  }

  private newShop(): void {
    session.newGame();
    void session.save().catch(() => undefined);
    this.scene.start(SCENE_KEYS.prep);
  }

  private exposeDebugApi(): void {
    const api = {
      stats: () => openingStats(session.state),
      keepPlaying: () => this.keepPlaying(),
      newShop: () => this.newShop(),
    };
    (window as unknown as { __nyanMilestone: typeof api }).__nyanMilestone = api;
  }
}
