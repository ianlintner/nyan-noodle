import type Phaser from 'phaser';
import { NATIVE_HEIGHT } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';

let activeOverlay: { kind: 'callout' | 'help'; id: CoachScene } | null = null;

/** Exposed for e2e: Phaser text lives on the canvas, not in the DOM. */
export interface CoachSnapshot {
  seen: CoachScene[];
  open: 'callout' | 'help' | null;
  id: CoachScene | null;
  text: string | null;
}

/** Game-side settings key; deliberately outside the sim save slot. */
export const COACH_KEY = 'nyan-noodle/coach';

export const COACH_SCENES = ['prep', 'kitchen', 'shop', 'report', 'upgrades', 'build'] as const;
export type CoachScene = (typeof COACH_SCENES)[number];
export type SeenHints = Record<CoachScene, boolean>;

export const EMPTY_HINTS: SeenHints = {
  prep: false,
  kitchen: false,
  shop: false,
  report: false,
  upgrades: false,
  build: false,
};

/** Reject malformed/stale values instead of trusting whatever is in storage. */
export function parseSeenHints(text: string | null): SeenHints {
  const seen = { ...EMPTY_HINTS };
  if (!text) return seen;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return seen;
  }
  if (typeof raw !== 'object' || raw === null) return seen;
  for (const id of COACH_SCENES) {
    seen[id] = (raw as Record<string, unknown>)[id] === true;
  }
  return seen;
}

/** Stable key order so writes never depend on insertion order. */
export function serializeSeenHints(hints: SeenHints): string {
  const ordered = {} as Record<CoachScene, boolean>;
  for (const id of COACH_SCENES) ordered[id] = hints[id] === true;
  return JSON.stringify(ordered);
}

/**
 * Tracks which first-run callouts have been shown. Reads once at boot; a failed backend
 * never blocks play, and every write is best-effort across the same stores as audio settings.
 */
export class CoachStore {
  private hints: SeenHints = { ...EMPTY_HINTS };
  private loading: Promise<void> | null = null;
  private pending: Promise<void> = Promise.resolve();
  lastError: string | null = null;

  constructor(
    private readonly get: (key: string) => Promise<string | null>,
    private readonly set: (key: string, value: string) => Promise<void>,
    private readonly remove: (key: string) => Promise<void>,
  ) {}

  ready(): Promise<void> {
    this.loading ??= this.get(COACH_KEY)
      .then((text) => {
        this.hints = parseSeenHints(text);
        this.lastError = null;
      })
      .catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    return this.loading;
  }

  has(id: CoachScene): boolean {
    return this.hints[id] === true;
  }

  seen(): CoachScene[] {
    return COACH_SCENES.filter((id) => this.hints[id]);
  }

  mark(id: CoachScene): void {
    if (this.hints[id]) return;
    this.hints = { ...this.hints, [id]: true };
    this.pending = this.set(COACH_KEY, serializeSeenHints(this.hints)).catch((error: unknown) => {
      this.lastError = error instanceof Error ? error.message : String(error);
    });
  }

  /** Lets tests and scene shutdown wait for the last best-effort write to settle. */
  flush(): Promise<void> {
    return this.pending;
  }

  async reset(): Promise<void> {
    this.hints = { ...EMPTY_HINTS };
    this.loading = null;
    await this.pending;
    this.pending = Promise.resolve();
    try {
      await this.remove(COACH_KEY);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }
}

interface CoachContent {
  readonly callout: string;
  readonly help: readonly string[];
}

const CONTENT: Record<CoachScene, CoachContent> = {
  prep: {
    callout: 'Tap recipes, buy stock, then Open the shop!',
    help: [
      'POINTER: menu On/Off, +/- price, Buy stock',
      'KEYS: no shortcuts in Prep - tap the buttons',
      'Stock is the number of bowls you can serve today.',
    ],
  },
  kitchen: {
    callout: 'Tap a ticket - heat, stop noodles, add toppings',
    help: [
      'TOUCH: tap tickets, hold HEAT, tap topping pads',
      'KEYS: SPACE advance/stop, W heat, 1-6 toppings',
      'Serve before the customer loses patience.',
    ],
  },
  shop: {
    callout: 'Build furniture, then let the day run',
    help: [
      'TOUCH: drag to pan, pinch to zoom, tap the day buttons',
      'KEYS: arrows/WASD pan, +/- zoom, R rotates in build mode',
      'Skip day speeds up; Done ends the service day.',
    ],
  },
  report: {
    callout: 'Read takings, then start the next day',
    help: [
      'POINTER: Upgrades or Start day',
      'KEYS: no shortcuts on the report',
      'Complaints cost reputation; tips pay extra coins.',
    ],
  },
  upgrades: {
    callout: 'Spend coins and stars to grow the shop',
    help: [
      'POINTER: tap a row button to buy or train',
      'KEYS: no shortcuts in the upgrade shop',
      'Mastery lifts quality; staff add cooking capacity.',
    ],
  },
  build: {
    callout: 'Pick a tool, tap a tile, R to rotate',
    help: [
      'TOUCH: tap a tool, tap a grid cell; panel buttons move/sell/rotate',
      'KEYS: R rotate, arrows/WASD pan, +/- zoom',
      'Tap Build again to leave build mode.',
    ],
  },
};

/** The "?" sits in empty header space (or beside the kitchen rail). */
const BUTTON: Record<CoachScene, { x: number; y: number; w: number; h: number; calloutX: number }> =
  {
    prep: { x: 236, y: 6, w: 12, h: 12, calloutX: 100 },
    kitchen: { x: 8, y: NATIVE_HEIGHT - 42, w: 14, h: 14, calloutX: 4 },
    shop: { x: 236, y: 6, w: 12, h: 12, calloutX: 100 },
    report: { x: 4, y: 4, w: 12, h: 12, calloutX: 60 },
    upgrades: { x: 236, y: 6, w: 12, h: 12, calloutX: 100 },
    build: { x: 236, y: 6, w: 12, h: 12, calloutX: 100 },
  };

/**
 * One call per scene. Adds a "?" help button and, on a fresh settings slot, a one-line
 * callout. Overlays are non-interactive so the existing controls keep receiving taps;
 * any tap away from "?" or any key dismisses them.
 */
export function installCoach(scene: Phaser.Scene, id: CoachScene, store: CoachStore): void {
  const spec = BUTTON[id];
  let overlay: Phaser.GameObjects.GameObject[] = [];
  let open: 'callout' | 'help' | null = null;

  const hide = (): void => {
    for (const object of overlay) object.destroy();
    overlay = [];
    open = null;
    activeOverlay = null;
  };

  const showCallout = (): void => {
    hide();
    const { graphics } = drawPanel(scene, spec.calloutX, 22, 320, 22, { title: 'Coach' });
    const text = pixelText(scene, spec.calloutX + 6, 34, CONTENT[id].callout, { token: 'ink' });
    graphics.setDepth(950);
    text.setDepth(951);
    overlay = [graphics, text];
    open = 'callout';
    activeOverlay = { kind: 'callout', id };
  };

  const showHelp = (): void => {
    hide();
    const { graphics } = drawPanel(scene, 40, 46, 400, 64, { title: `Help - ${id}` });
    const lines = CONTENT[id].help.map((line, i) =>
      pixelText(scene, 46, 66 + i * 12, line, { token: i === 2 ? 'slate' : 'ink' }),
    );
    overlay = [graphics, ...lines];
    graphics.setDepth(950);
    for (const line of lines) line.setDepth(951);
    open = 'help';
    activeOverlay = { kind: 'help', id };
  };

  const button = createButton(scene, spec.x, spec.y, spec.w, spec.h, '?', () => {
    if (open === 'help') hide();
    else showHelp();
  });
  button.container.setDepth(900);
  button.container.setData('nyanCoach', id);

  const onPointer = (pointer: Phaser.Input.Pointer): void => {
    if (!open) return;
    const hit = scene.input.hitTestPointer(pointer) as Phaser.GameObjects.GameObject[];
    if (!hit.includes(button.container)) hide();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.key.toLowerCase() === 'h' || event.key === '?') {
      if (open === 'help') hide();
      else showHelp();
      return;
    }
    hide();
  };
  scene.input.on('pointerdown', onPointer);
  scene.input.keyboard?.on('keydown', onKey);
  scene.events.once('shutdown', () => {
    scene.input.off('pointerdown', onPointer);
    scene.input.keyboard?.off('keydown', onKey);
    hide();
  });

  void store.ready().then(() => {
    if (store.has(id) || !scene.sys.isActive()) return;
    store.mark(id);
    showCallout();
  });
}

/**
 * Callout-only hook for modes entered after scene creation (build mode from the shop).
 * It reuses the same "seen once" store and dismisses on the next tap or key.
 */
export function showCoachOnce(scene: Phaser.Scene, id: CoachScene, store: CoachStore): void {
  void store.ready().then(() => {
    if (store.has(id) || !scene.sys.isActive()) return;
    store.mark(id);
    const { graphics } = drawPanel(scene, BUTTON[id].calloutX, 22, 320, 22, { title: 'Coach' });
    const text = pixelText(scene, BUTTON[id].calloutX + 6, 34, CONTENT[id].callout, {
      token: 'ink',
    });
    graphics.setDepth(950);
    text.setDepth(951);
    activeOverlay = { kind: 'callout', id };
    const dismiss = (): void => {
      graphics.destroy();
      text.destroy();
      activeOverlay = null;
      scene.input.off('pointerdown', dismiss);
      scene.input.keyboard?.off('keydown', dismiss);
    };
    scene.input.once('pointerdown', dismiss);
    scene.input.keyboard?.once('keydown', dismiss);
    scene.events.once('shutdown', dismiss);
  });
}

/** Debug hooks for the coach spec; read-only except for the deliberate reset. */
export function exposeCoachApi(store: CoachStore): void {
  const api = {
    seen: () => store.seen(),
    reset: () => store.reset(),
    flush: () => store.flush(),
    snapshot: (): CoachSnapshot => ({
      seen: store.seen(),
      open: activeOverlay?.kind ?? null,
      id: activeOverlay?.id ?? null,
      text: activeOverlay
        ? activeOverlay.kind === 'callout'
          ? CONTENT[activeOverlay.id].callout
          : CONTENT[activeOverlay.id].help.join(' | ')
        : null,
    }),
  };
  (window as unknown as { __nyanCoach: typeof api }).__nyanCoach = api;
}
