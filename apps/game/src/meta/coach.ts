import type Phaser from 'phaser';
import { NATIVE_HEIGHT } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';

/** `token` identifies the owning overlay so a late hide never clears a newer one. */
let activeOverlay: { kind: 'callout' | 'help'; id: CoachScene; token: object } | null = null;

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
    callout: 'Watch the day run - xN button sets the speed',
    help: [
      'TOUCH: drag to pan, pinch to zoom, tap the xN speed button',
      'KEYS: arrows/WASD pan, +/- zoom',
      'xN cycles speed x1-x8; Skip day ends service at once.',
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
      'Tap Done (or Open shop) to leave build mode.',
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
export interface CoachOptions {
  /** Hide each overlay object from every camera except the HUD one (multi-camera scenes). */
  registerUi?: (object: Phaser.GameObjects.GameObject) => void;
}

export interface CoachHandle {
  /** Switch which scene's help the "?" opens (the shop flips between shop and build). */
  setContext(id: CoachScene): void;
  /** Show that scene's one-time callout, if it has not been seen on this save. */
  callout(id: CoachScene): void;
}

/** Padded hit rectangle of a scene's "?" so build input can ignore taps on it. */
export function overCoachButton(id: CoachScene, x: number, y: number, pad = 4): boolean {
  const b = BUTTON[id];
  return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
}

type Layered = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth;

export function installCoach(
  scene: Phaser.Scene,
  initial: CoachScene,
  store: CoachStore,
  options: CoachOptions = {},
): CoachHandle {
  let id = initial;
  let overlay: Phaser.GameObjects.GameObject[] = [];
  let open: 'callout' | 'help' | null = null;
  let token: object | null = null;

  const hide = (): void => {
    for (const object of overlay) object.destroy();
    overlay = [];
    open = null;
    if (token && activeOverlay?.token === token) activeOverlay = null;
    token = null;
  };

  /** Run a draw routine and adopt every object it adds (panel titles included). */
  const adopt = (kind: 'callout' | 'help', shown: CoachScene, draw: () => void): void => {
    hide();
    const before = new Set(scene.children.list);
    draw();
    overlay = scene.children.list.filter((o) => !before.has(o));
    for (const object of overlay) {
      (object as Layered).setDepth(object.type === 'Graphics' ? 950 : 951);
      options.registerUi?.(object);
    }
    open = kind;
    token = { kind, shown };
    activeOverlay = { kind, id: shown, token };
  };

  const showCallout = (shown: CoachScene): void =>
    adopt('callout', shown, () => {
      const x = BUTTON[shown].calloutX;
      drawPanel(scene, x, 22, 320, 22);
      pixelText(scene, x + 6, 29, CONTENT[shown].callout, { token: 'ink' });
    });

  const showHelp = (): void =>
    adopt('help', id, () => {
      drawPanel(scene, 40, 46, 400, 64, { title: `Help - ${id}` });
      CONTENT[id].help.forEach((line, i) =>
        pixelText(scene, 46, 66 + i * 12, line, { token: i === 2 ? 'slate' : 'ink' }),
      );
    });

  const toggleHelp = (): void => (open === 'help' ? hide() : showHelp());

  const spec = BUTTON[initial];
  const button = createButton(scene, spec.x, spec.y, spec.w, spec.h, '?', toggleHelp);
  button.container.setDepth(900);
  button.container.setData('nyanCoach', initial);

  const onPointer = (pointer: Phaser.Input.Pointer): void => {
    if (!open) return;
    const hit = scene.input.hitTestPointer(pointer) as Phaser.GameObjects.GameObject[];
    if (!hit.includes(button.container)) hide();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'h' || event.key === '?') return toggleHelp();
    if (open) hide();
  };
  scene.input.on('pointerdown', onPointer);
  scene.input.keyboard?.on('keydown', onKey);
  scene.events.once('shutdown', () => {
    scene.input.off('pointerdown', onPointer);
    scene.input.keyboard?.off('keydown', onKey);
    hide();
  });

  const callout = (shown: CoachScene): void =>
    void store.ready().then(() => {
      if (store.has(shown) || !scene.sys.isActive()) return;
      store.mark(shown);
      showCallout(shown);
    });
  callout(initial);

  return {
    setContext(next) {
      if (next === id) return;
      hide();
      id = next;
    },
    callout,
  };
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
