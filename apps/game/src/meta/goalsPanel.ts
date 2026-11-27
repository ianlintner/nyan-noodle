import type Phaser from 'phaser';
import { currentGoals, evaluateGoals, getTier, openingStats } from '@nyan-noodle/sim';
import type { GoalDef, GoalStatus, SimState } from '@nyan-noodle/sim';
import { PANEL_TEXT } from '../theme/palette';
import { drawPanel, pixelText } from '../theme/hud';
import { session } from './session';
import { starsNumber } from './ui';

/** Reward text such as "+15c" or "+15c +0.05*". */
export function rewardText(coins: number, stars: number): string {
  const parts = [`+${coins}c`];
  if (stars > 0) parts.push(`+${stars} star`);
  return parts.join(' ');
}

function progressText(def: GoalDef, value: number): string {
  if (def.kind === 'stars') return `${starsNumber(value)}/${starsNumber(def.target)}`;
  return `${value}/${def.target}`;
}

/** Small "Goals" panel: the current tier's three objectives with progress and reward. */
export function drawGoalsPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  state: SimState,
): void {
  const panel = drawPanel(scene, x, y, width, height, {
    title: `Goals - ${getTier(state.tierId).name}`,
  });
  let ry = panel.content.y + 3;
  const left = panel.content.x + 4;
  const right = panel.content.x + panel.content.width - 4;
  for (const g of currentGoals(state)) {
    pixelText(scene, left, ry, g.done ? '[x]' : '[ ]', { token: g.done ? 'noriGreen' : 'slate' });
    pixelText(scene, left + 26, ry, g.def.title, { token: g.done ? 'slate' : 'ink' });
    pixelText(scene, right - 62, ry, g.done ? 'done' : progressText(g.def, g.value), {
      token: g.done ? 'noriGreen' : 'slate',
      originX: 1,
    });
    pixelText(scene, right, ry, rewardText(g.def.rewardCoins, g.def.rewardStars), {
      token: PANEL_TEXT.gold,
      originX: 1,
    });
    ry += 11;
  }
}

interface GoalsApi {
  current: () => readonly GoalStatus[];
  completed: () => readonly string[];
  opening: () => string;
  openingStats: () => unknown;
  /** Test hook: jump to a full-star Grand Hall and arm the Grand Opening. */
  forceGrandOpening: () => string;
}

/** `window.__nyanGoals`, shared by Prep, Report and Milestone like the other `__nyan*` hooks. */
export function exposeGoalsApi(): void {
  const api: GoalsApi = {
    current: () => JSON.parse(JSON.stringify(currentGoals(session.state))) as GoalStatus[],
    completed: () => [...session.state.goals.completed],
    opening: () => session.state.goals.opening,
    openingStats: () => openingStats(session.state),
    forceGrandOpening: () => {
      const s = session.state;
      const top: SimState = {
        ...s,
        tierId: 'grand-hall',
        economy: { ...s.economy, reputation: 5 },
      };
      const armed = evaluateGoals(top, { served: 0, perfectBowls: 0 }).state;
      session.update(armed);
      return armed.goals.opening;
    },
  };
  (window as unknown as { __nyanGoals: GoalsApi }).__nyanGoals = api;
}
