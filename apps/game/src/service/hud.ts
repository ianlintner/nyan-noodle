import type Phaser from 'phaser';
import { NATIVE_WIDTH } from '../config';
import { color, PANEL_TEXT } from '../theme/palette';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';
import type { ServiceLayout } from './layout';
import { stageBar, stageVessels } from './layout';
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
  /** Atlas sprites behind the stage bar, switched by the active cooking stage. */
  vessels: { pot: Phaser.GameObjects.Image; basket: Phaser.GameObjects.Image };
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
  const bar = stageBar(cooking);
  const vessels = stageVessels(cooking, bar);
  // A pot for the broth/topping stages and a noodle basket for the boil stage sit
  // beside the gauge as 2x sprites, not as a tiny icon at the gauge's end.
  const pot = s.scene.add
    .image(vessels.pot.x, vessels.pot.y, ATLAS_KEY, 'furniture/big_pot')
    .setOrigin(0, 0)
    .setScale(2);
  const basket = s.scene.add
    .image(vessels.basket.x, vessels.basket.y, ATLAS_KEY, 'ingredient/noodles')
    .setOrigin(0, 0)
    .setScale(2);
  const stageG = s.scene.add.graphics();
  const stageText = pixelText(s.scene, content.x + 2, content.y + 4, s.intro);
  stageText.setWordWrapWidth(content.width - 4);
  const statusText = pixelText(
    s.scene,
    content.x + 2,
    content.y + Math.min(134, cooking.h - 24),
    '',
    { token: PANEL_TEXT.gold },
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
  // The key hints get an opaque night strip instead of sitting directly on the
  // wooden floor trim, where cream-on-brown was hard to read.
  const footerBg = s.scene.add.graphics();
  footerBg.fillStyle(color('nightBlue'), 1);
  footerBg.fillRect(2, hintY - 2, NATIVE_WIDTH - 4, 12);
  pixelText(
    s.scene,
    4,
    hintY,
    s.layout.railRows > 1
      ? 'tap tickets   HOLD  STOP  1-6 toppings'
      : 'click tickets   SPACE advance   W heat   1-6 toppings',
    { token: 'cream' },
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
    vessels: { pot, basket },
    stageText,
    statusText,
    touch,
  };
}
