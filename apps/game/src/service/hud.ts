import type Phaser from 'phaser';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import type { ServiceLayout } from './layout';
import { drawTodayPanel } from './stageView';
import { ServiceTouchControls } from './touch';

export interface ServiceHudState {
  scene: Phaser.Scene;
  layout: ServiceLayout;
  inSession: boolean;
  todayLines: readonly string[];
  intro: string;
  onHold(on: boolean): void;
  onStop(): void;
  onTopping(index: number): void;
  onServe(): void;
  onOpenDoors(): void;
}

export interface ServiceHud {
  objects: Phaser.GameObjects.GameObject[];
  stageG: Phaser.GameObjects.Graphics;
  stageText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  touch: ServiceTouchControls;
}

/** Build the HUD for one orientation; the scene owns state and the ticket rail. */
export function buildServiceHud(s: ServiceHudState): ServiceHud {
  const before = new Set(s.scene.children.list);
  const { rail, cooking, today, touch: pad, openDoors, hintY } = s.layout;
  drawPanel(s.scene, rail.x, rail.y, rail.w, rail.h);
  const { content } = drawPanel(s.scene, cooking.x, cooking.y, cooking.w, cooking.h, {
    title: 'Cooking',
  });
  const stageG = s.scene.add.graphics();
  const stageText = pixelText(s.scene, content.x + 2, content.y + 4, s.intro);
  const statusText = pixelText(
    s.scene,
    content.x + 2,
    content.y + Math.min(134, cooking.h - 24),
    '',
    { token: 'lanternYellow' },
  );
  if (s.inSession) {
    drawTodayPanel(s.scene, s.todayLines, today);
    createButton(
      s.scene,
      openDoors.x,
      openDoors.y,
      openDoors.w,
      openDoors.h,
      'Open doors!',
      s.onOpenDoors,
    );
  }
  pixelText(
    s.scene,
    4,
    hintY,
    s.layout.railRows > 1
      ? 'tap tickets   HOLD  STOP  1-6 toppings'
      : 'click tickets   SPACE advance   W heat   1-6 toppings',
    { token: 'steamWhite' },
  );
  const touch = new ServiceTouchControls(s.scene, pad, s.layout.railRows > 1, {
    hold: s.onHold,
    stop: s.onStop,
    topping: s.onTopping,
    serve: s.onServe,
    openDoors: s.onOpenDoors,
  });
  return {
    objects: s.scene.children.list.filter((o) => !before.has(o)),
    stageG,
    stageText,
    statusText,
    touch,
  };
}
