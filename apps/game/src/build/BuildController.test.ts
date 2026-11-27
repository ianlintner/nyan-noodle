import { createSimState, type SimState } from '@nyan-noodle/sim';
import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { BuildController } from './BuildController';

type Pointer = Phaser.Input.Pointer;

/** Chainable no-op stand-in for a Phaser display object. */
function chainable(): Record<string, () => unknown> {
  const obj: Record<string, () => unknown> = {};
  for (const method of [
    'setDepth',
    'setOrigin',
    'setAlpha',
    'setVisible',
    'setFrame',
    'setPosition',
    'clearTint',
    'setTint',
    'clear',
    'fillStyle',
    'fillRect',
    'setText',
  ]) {
    obj[method] = () => obj;
  }
  return obj;
}

function harness(overUi: (x: number, y: number) => boolean) {
  const handlers = new Map<string, (p: Pointer) => void>();
  const scene = {
    add: { graphics: chainable, image: chainable, text: chainable },
    input: { on: (event: string, fn: (p: Pointer) => void) => handlers.set(event, fn) },
    // +16 keeps screen points on floor tiles (toGrid subtracts the wall tile).
    cameras: { main: { getWorldPoint: (x: number, y: number) => ({ x: x + 16, y: y + 16 }) } },
  } as unknown as Phaser.Scene;
  let state: SimState = createSimState(1, 'cart');
  const controller = new BuildController({
    scene,
    getState: () => state,
    commit: (next) => {
      state = next;
    },
    register: () => {},
    overUi,
    say: () => {},
  });
  controller.enable();
  const emit = (event: string, x: number, y: number, id = 1, wasTouch = true): void => {
    const p = { id, x, y, wasTouch, rightButtonDown: () => false } as unknown as Pointer;
    handlers.get(event)?.(p);
  };
  return { controller, emit };
}

describe('BuildController touch input', () => {
  it('ignores a floor release when the press started on HUD chrome', () => {
    const { controller, emit } = harness((x) => x < 24);
    const click = vi.spyOn(controller, 'clickCell');
    emit('pointerdown', 20, 20); // over the HUD
    emit('pointermove', 26, 20); // 6px slide, below the 8px cancel threshold
    emit('pointerup', 26, 20); // outside the HUD, on the floor
    expect(click).not.toHaveBeenCalled();
  });

  it('still commits a single-finger tap that started on the floor', () => {
    const { controller, emit } = harness((x) => x < 24);
    const click = vi.spyOn(controller, 'clickCell');
    emit('pointerdown', 30, 20);
    emit('pointerup', 30, 20);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('discards a pending floor tap when a second finger lands on the HUD', () => {
    const { controller, emit } = harness((x) => x < 24);
    const click = vi.spyOn(controller, 'clickCell');
    emit('pointerdown', 30, 20, 1);
    emit('pointerdown', 10, 20, 2);
    emit('pointerup', 30, 20, 1);
    expect(click).not.toHaveBeenCalled();
  });
});
