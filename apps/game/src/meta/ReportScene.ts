import Phaser from 'phaser';
import { getTier, openingPending } from '@nyan-noodle/sim';
import type { ComplaintKind, DayReport } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { audio } from '../audio/manager';
import { exposeGoalsApi, rewardText } from './goalsPanel';
import { session } from './session';
import { installCoach } from './coach';
import { SCENE_KEYS, backdrop, icon, loadAtlas, messageLine, signed, starsNumber } from './ui';

export const REPORT_SCENE_KEY = SCENE_KEYS.report;

const COMPLAINT_LABEL: Record<ComplaintKind, string> = {
  queue: 'waited too long',
  'sold-out': 'sold out',
  'too-slow': 'kitchen too slow',
  pricey: 'too pricey',
};

/** Close-of-day report: sales, tips, complaints, reputation change and unlocks. */
export class ReportScene extends Phaser.Scene {
  private msg!: ReturnType<typeof messageLine>;

  constructor() {
    super(REPORT_SCENE_KEY);
  }

  preload(): void {
    loadAtlas(this);
  }

  create(): void {
    audio.setMusicMode('prep');
    backdrop(this);
    const state = session.state;
    const report = state.lastReport;
    this.msg = messageLine(this, NATIVE_HEIGHT - 38);
    if (!report) {
      this.scene.start(SCENE_KEYS.prep);
      return;
    }
    this.draw(report);
    installCoach(this, 'report', session.coach);
    createButton(this, 6, NATIVE_HEIGHT - 26, 90, 18, 'Upgrades', () =>
      this.scene.start(SCENE_KEYS.upgrades),
    );
    createButton(
      this,
      NATIVE_WIDTH - 126,
      NATIVE_HEIGHT - 26,
      120,
      18,
      `Start day ${state.clock.day}`,
      () => this.next(),
    );
    // Day-end autosave.
    this.msg.say('Saving...');
    session
      .save()
      .then(() => {
        this.registry.set('savedDay', report.day);
        // The player may already have left for the next scene; its text is gone by then.
        if (this.sys.isActive()) this.msg.say('Day saved');
      })
      .catch(() => {
        if (this.sys.isActive())
          this.msg.say('Could not save - use Export on the title screen', false);
      });
    this.exposeDebugApi(report);
    this.registry.set('reportReady', true);
  }

  private draw(report: DayReport): void {
    const state = session.state;
    pixelText(this, NATIVE_WIDTH / 2, 6, `Day ${report.day} report`, {
      scale: 2,
      token: 'lanternYellow',
      originX: 0.5,
    });
    pixelText(
      this,
      NATIVE_WIDTH - 8,
      8,
      `${getTier(state.tierId).name}   ${state.economy.fishCoins} coins`,
      { token: 'cream', originX: 1 },
    );

    const left = drawPanel(this, 6, 26, 224, 170, { title: 'Takings' });
    const rows: [string, string, boolean?][] = [
      ['Cats served', `${report.customersServed}`],
      ['Cats who left', `${report.customersLost}`],
      ['Bowl sales', `${report.revenue}c`],
      ['Tips', `${report.tips}c`],
      ['Costs (wages+stock)', `-${report.costs}c`],
      ['Profit', `${signed(report.profit)}c`, true],
      ['Stock left', `${report.stockLeft} bowls`],
    ];
    let y = left.content.y + 4;
    for (const [label, value, bold] of rows) {
      pixelText(this, left.content.x + 4, y, label, { token: bold ? 'ink' : 'slate' });
      pixelText(this, left.content.x + left.content.width - 4, y, value, {
        token: bold ? (report.profit >= 0 ? 'noriGreen' : 'chiliRed') : 'ink',
        originX: 1,
      });
      y += 14;
    }
    icon(this, left.content.x + 4, y + 6, 'coin');
    pixelText(this, left.content.x + 24, y + 10, `Now ${state.economy.fishCoins} Fish Coins`);

    // Goals finished by this day's settle; the reward is already in the coin total above.
    const done = report.goalsCompleted;
    if (done.length > 0) {
      const gx = left.content.x + 4;
      const coins = done.reduce((sum, g) => sum + g.coins, 0);
      const stars = done.reduce((sum, g) => sum + g.stars, 0);
      const more = done.length > 2 ? ` (+${done.length - 2} more)` : '';
      pixelText(this, gx, y + 22, `Goal complete! ${rewardText(coins, stars)}${more}`, {
        token: 'noriGreen',
      });
      for (const [i, g] of done.slice(0, 2).entries()) {
        pixelText(this, gx + 6, y + 32 + i * 10, `* ${g.title}`, { token: 'misoOrange' });
      }
    }

    const right = drawPanel(this, 236, 26, 238, 170, { title: 'Reputation & feedback' });
    let ry = right.content.y + 4;
    const rx = right.content.x + 4;
    icon(this, rx, ry - 2, 'star');
    pixelText(this, rx + 20, ry + 1, `${starsNumber(report.reputation)}/5`, { scale: 2 });
    ry += 20;
    pixelText(
      this,
      rx,
      ry,
      `${report.reputationDelta >= 0 ? '+' : ''}${report.reputationDelta.toFixed(2)} today`,
      { token: report.reputationDelta >= 0 ? 'noriGreen' : 'chiliRed' },
    );
    ry += 16;
    pixelText(this, rx, ry, `Complaints: ${report.complaints}`);
    ry += 11;
    const kinds = Object.entries(report.complaintKinds).filter(([, n]) => n > 0) as [
      ComplaintKind,
      number,
    ][];
    if (kinds.length === 0)
      pixelText(this, rx + 6, ry, 'None - purr-fect!', { token: 'noriGreen' });
    for (const [kind, n] of kinds) {
      pixelText(this, rx + 6, ry, `${n} ${COMPLAINT_LABEL[kind]}`, { token: 'slate' });
      ry += 10;
    }
    ry = Math.max(ry + 8, right.content.y + 96);
    pixelText(this, rx, ry, 'New today:', { token: 'misoOrange' });
    ry += 11;
    if (report.unlocks.length === 0)
      pixelText(this, rx + 6, ry, 'Nothing new yet', { token: 'slate' });
    for (const text of report.unlocks.slice(0, 4)) {
      pixelText(this, rx + 6, ry, `* ${text}`, { token: 'noriGreen' });
      ry += 10;
    }
  }

  /** On to the next day, via the Grand Opening screen the first time the top tier is mastered. */
  private next(): void {
    this.scene.start(openingPending(session.state) ? SCENE_KEYS.milestone : SCENE_KEYS.prep);
  }

  private exposeDebugApi(report: DayReport): void {
    exposeGoalsApi();
    const api = {
      report: () => report,
      state: () => JSON.parse(JSON.stringify(session.state)) as unknown,
      next: () => this.next(),
      upgrades: () => this.scene.start(SCENE_KEYS.upgrades),
    };
    (window as unknown as { __nyanReport: typeof api }).__nyanReport = api;
  }
}
