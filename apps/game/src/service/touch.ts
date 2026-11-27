import type Phaser from 'phaser';
import { NATIVE_WIDTH } from '../config';
import { color } from '../theme/palette';
import { FONT_FAMILY } from '../theme/hud';
import type { Rect } from './layout';

export type CookStage = 'broth' | 'noodles' | 'toppings' | 'serve';

export interface TouchHandlers {
  /** True while the broth-heat button is held. */
  hold(on: boolean): void;
  stop(): void;
  topping(index: number): void;
  serve(): void;
  openDoors(): void;
}

interface TouchButton {
  rect: Rect;
  zone: Phaser.GameObjects.Zone;
  face: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

/**
 * Big, finger-sized controls for the cooking minigames. One action button
 * changes meaning by stage (HOLD / STOP / SERVE); during toppings the whole pad
 * becomes six targets so each is ~42 CSS pixels on a 390px phone. Only the
 * active set is interactive, so hidden buttons cannot steal taps.
 */
export class ServiceTouchControls {
  private readonly action: TouchButton;
  private readonly toppings: TouchButton[];
  private readonly handlers: TouchHandlers;
  private readonly onPointerUp = (): void => this.releaseHold();
  private stage: CookStage = 'broth';
  private active = true;
  private holdOn = false;
  private required = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    pad: Rect,
    portrait: boolean,
    handlers: TouchHandlers,
  ) {
    this.handlers = handlers;
    const actionH = portrait ? pad.h - 6 : pad.h - 8;
    const actionW = portrait ? 150 : 92;
    this.action = this.makeButton(
      'action',
      {
        x: pad.x + 2,
        y: pad.y + 3,
        w: actionW,
        h: actionH,
      },
      'HOLD',
    );
    this.toppings = [];
    const topW = pad.w / 6;
    for (let i = 0; i < 6; i++) {
      this.toppings.push(
        this.makeButton(
          `top${i}`,
          {
            x: pad.x + i * topW,
            y: pad.y + 3,
            w: topW,
            h: actionH,
          },
          String(i + 1),
        ),
      );
    }
    this.action.zone.on('pointerdown', () => this.onActionDown());
    this.toppings.forEach((b, i) =>
      b.zone.on('pointerup', () => {
        if (this.active && this.stage === 'toppings' && i < this.required) {
          this.handlers.topping(i);
        }
      }),
    );
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('pointerupoutside', this.onPointerUp);
    this.update('broth', 0, true);
    (window as unknown as { __nyanTouch: unknown }).__nyanTouch = {
      screen: (name: string) => this.screenPoint(name),
      rects: () => ({ action: this.action.rect, toppings: this.toppings.map((b) => b.rect) }),
      stage: () => this.stage,
    };
  }

  private makeButton(name: string, rect: Rect, label: string): TouchButton {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const face = this.scene.add.graphics();
    this.paint(face, rect, false);
    const text = this.scene.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: rect.h > 60 ? '16px' : '12px',
        color: '#2b1d2e',
      })
      .setOrigin(0.5);
    const zone = this.scene.add
      .zone(cx, cy, rect.w, rect.h)
      .setInteractive({ useHandCursor: true });
    zone.setName(name);
    return { rect, zone, face, label: text };
  }

  private paint(g: Phaser.GameObjects.Graphics, r: Rect, pressed: boolean): void {
    g.clear();
    g.fillStyle(color('outline'), 1);
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(color(pressed ? 'misoOrange' : 'brothGold'), 1);
    g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.fillStyle(color('lanternYellow'), 1);
    g.fillRect(r.x + 2, r.y + 2, r.w - 4, 2);
  }

  private onActionDown(): void {
    if (!this.active) return;
    this.paint(this.action.face, this.action.rect, true);
    if (this.stage === 'broth') {
      this.holdOn = true;
      this.handlers.hold(true);
    } else if (this.stage === 'noodles') {
      this.handlers.stop();
    } else if (this.stage === 'serve') {
      this.handlers.serve();
    }
  }

  private releaseHold(): void {
    if (!this.holdOn) return;
    this.holdOn = false;
    this.paint(this.action.face, this.action.rect, false);
    this.handlers.hold(false);
  }

  private setVisible(button: TouchButton, show: boolean): void {
    button.zone.setVisible(show);
    button.face.setVisible(show);
    button.label.setVisible(show);
    if (button.zone.input) button.zone.input.enabled = show;
  }

  /** Show only the controls relevant to the current stage. */
  update(stage: CookStage, required: number, active: boolean): void {
    if (stage !== this.stage) this.releaseHold();
    this.stage = stage;
    this.required = required;
    this.active = active;
    const actionLabel = stage === 'broth' ? 'HOLD' : stage === 'noodles' ? 'STOP' : 'SERVE';
    this.action.label.setText(actionLabel);
    this.setVisible(this.action, active && stage !== 'toppings');
    this.toppings.forEach((b, i) =>
      this.setVisible(b, active && stage === 'toppings' && i < this.required),
    );
    if (!active) this.releaseHold();
  }

  /** Detach listeners before an orientation rebuild; the scene destroys the display objects. */
  destroy(): void {
    this.releaseHold();
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointerupoutside', this.onPointerUp);
    delete (window as unknown as { __nyanTouch?: unknown }).__nyanTouch;
  }

  /** Page coordinates of a control's centre, for Playwright touch emulation. */
  screenPoint(name: string): { x: number; y: number } {
    const button = name === 'action' ? this.action : this.toppings[Number(name.replace('top', ''))];
    if (!button) throw new Error(`unknown touch control: ${name}`);
    const r = button.rect;
    const canvas = this.scene.game.canvas.getBoundingClientRect();
    const scale = canvas.width / NATIVE_WIDTH;
    return {
      x: canvas.left + (r.x + r.w / 2) * scale,
      y: canvas.top + (r.y + r.h / 2) * scale,
    };
  }
}
