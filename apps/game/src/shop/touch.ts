import type Phaser from 'phaser';
import { NATIVE_HEIGHT } from '../config';
import { createButton } from '../theme/hud';
import type { ButtonHandle } from '../theme/hud';
import type { BuildController } from '../build/BuildController';
import type { CameraRig } from './CameraRig';
import { nativeScreenPoint } from './screen';

/** True inside the build-mode rotate/cancel touch buttons. */
export function overBuildTouch(x: number, y: number): boolean {
  // Buttons are 14px tall at y=252 with a 5px touch pad, so their hit areas start at 247.
  return y >= NATIVE_HEIGHT - 23 && x >= 118 && x < 246;
}

interface TouchBindings {
  rig: CameraRig;
  build: BuildController;
  isBuild(): boolean;
}

export interface ShopTouchUi {
  setVisible(visible: boolean): void;
}

/**
 * Touch equivalents for the shop: two-finger pinch zoom (with single-finger
 * drag-to-pan already handled by CameraRig) and build-mode rotate/cancel buttons
 * for the keyboard-only R and Escape shortcuts.
 */
export function installShopTouch(scene: Phaser.Scene, b: TouchBindings): ShopTouchUi {
  // Phaser defaults to a single touch pointer; two are needed for pinch.
  scene.input.addPointer(2);
  const points = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;
  let pinchZoom = 1;
  const spread = (): number => {
    const [a, c] = [...points.values()];
    return a && c ? Math.hypot(a.x - c.x, a.y - c.y) : 0;
  };
  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    points.set(p.id, { x: p.x, y: p.y });
    if (points.size === 2) {
      pinchDistance = spread();
      pinchZoom = b.rig.zoom;
      b.rig.dragEnabled = false;
      b.rig.cancelDrag();
    }
  });
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (!points.has(p.id)) return;
    points.set(p.id, { x: p.x, y: p.y });
    if (points.size >= 2 && pinchDistance > 0) {
      b.rig.setZoom((pinchZoom * spread()) / pinchDistance);
    }
  });
  const release = (p: Phaser.Input.Pointer): void => {
    points.delete(p.id);
    if (points.size < 2) {
      pinchDistance = 0;
      b.rig.dragEnabled = !b.isBuild();
    }
  };
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);

  const rotate = createButton(scene, 124, NATIVE_HEIGHT - 18, 56, 14, 'Rotate', () =>
    b.build.rotate(),
  );
  const cancel = createButton(scene, 184, NATIVE_HEIGHT - 18, 56, 14, 'Cancel', () =>
    b.build.cancel(),
  );
  const buttons: ButtonHandle[] = [rotate, cancel];
  scene.cameras.main.ignore(buttons.map((x) => x.container));
  (window as unknown as { __nyanShopTouch: unknown }).__nyanShopTouch = {
    screen: (x: number, y: number) => nativeScreenPoint(scene, x, y),
    rotateScreen: () => nativeScreenPoint(scene, 152, NATIVE_HEIGHT - 11),
    cancelScreen: () => nativeScreenPoint(scene, 212, NATIVE_HEIGHT - 11),
  };
  return {
    setVisible(visible) {
      for (const button of buttons) button.container.setVisible(visible);
    },
  };
}
