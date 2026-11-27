import type Phaser from 'phaser';
import {
  activeSeats,
  appealScore,
  getTier,
  layoutDemandMultiplier,
  upgradeInfo,
  type ShopTierId,
  type SimState,
} from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText, type ButtonHandle } from '../theme/hud';
import type { BuildController, BuildTool } from '../build/BuildController';
import { BuildPanel } from '../build/BuildPanel';
import type { CameraRig } from './CameraRig';
import { installShopTouch, type ShopTouchUi } from './touch';

export interface ShopHudState {
  scene: Phaser.Scene;
  inSession: boolean;
  tierId: ShopTierId;
  rig: CameraRig;
  build: BuildController;
  isBuild(): boolean;
  speed(): number;
  onSpeed(next: number): void;
  onToggle(): void;
  onPick(tool: BuildTool): void;
  onRotate(): void;
  onUpgrade(): void;
}

export interface ShopHud {
  hudText: Phaser.GameObjects.Text;
  msgText: Phaser.GameObjects.Text;
  toggle: ButtonHandle;
  speedButton: ButtonHandle | null;
  buildPanel: BuildPanel;
  touchUi: ShopTouchUi;
}

/** The shop's fixed HUD, built once per scene create. Behaviour lives in ShopScene. */
export function buildShopHud(s: ShopHudState): ShopHud {
  const { content } = drawPanel(s.scene, 4, 4, 128, 66, { title: 'Nyan Noodle' });
  const hudText = pixelText(s.scene, content.x + 2, content.y + 1, '');
  const msgText = pixelText(s.scene, 6, 62, '', { token: 'brothGold' });
  const toggle = createButton(s.scene, 4, NATIVE_HEIGHT - 18, 64, 14, 'Build', s.onToggle);
  let speedButton: ButtonHandle | null = null;
  if (s.inSession) {
    speedButton = createButton(s.scene, 72, NATIVE_HEIGHT - 18, 48, 14, 'x1', () => {
      const next = s.speed() >= 8 ? 1 : s.speed() * 2;
      s.onSpeed(next);
      speedButton?.setLabel(`x${next}`);
    });
  }
  const buildPanel = new BuildPanel(
    s.scene,
    { pick: s.onPick, rotate: s.onRotate, upgrade: s.onUpgrade },
    s.tierId,
  );
  const touchUi = installShopTouch(s.scene, {
    rig: s.rig,
    build: s.build,
    isBuild: s.isBuild,
  });
  pixelText(s.scene, NATIVE_WIDTH - 4, NATIVE_HEIGHT - 3, '+/- zoom  arrows pan', {
    token: 'cream',
    originX: 1,
    originY: 1,
  });
  return { hudText, msgText, toggle, speedButton, buildPanel, touchUi };
}

/** Build-mode summary shown in the shop HUD panel. */
export function shopBuildSummary(s: SimState): string {
  const tier = getTier(s.tierId);
  const seats = activeSeats(s.tierId, s.items).length;
  const stoves = s.items.filter((i) => i.kind === 'stove').length;
  const demand = Math.round(
    (layoutDemandMultiplier(s.tierId, s.items) / tier.demandMultiplier - 1) * 100,
  );
  const up = upgradeInfo(s);
  const need = up ? `Next: ${up.cost}c ${up.reputation}*` : 'Top tier';
  return (
    `${tier.name}  Coins ${s.economy.fishCoins}\n` +
    `Seats ${seats}/${tier.seats} Stoves ${stoves}/${tier.stoves}\n` +
    `Appeal ${appealScore(s.items)} (+${demand}%) ${need}`
  );
}
