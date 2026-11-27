import Phaser from 'phaser';
import type { ToppingId } from '@nyan-noodle/sim';
import { nativeScreenPoint } from '../shop/screen';
import type { emptyBrothHold } from './measure';
import type { ServiceLayout } from './layout';
import type { ServiceTicket } from './tickets';
import type { CookStage } from './touch';

export interface NativeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextBox extends NativeBox {
  readonly text: string;
}

/**
 * The scene state the e2e debug bridge reads. Keeping the bridge here lets the
 * scene stay under the architecture file cap without changing what it exposes.
 */
export interface ServiceDebugView {
  readonly inSession: boolean;
  readonly stage: CookStage;
  readonly activeIdx: number;
  readonly streak: number;
  readonly coins: number;
  readonly completed: ReadonlySet<number>;
  readonly qualities: readonly (number | null)[];
  readonly tickets: readonly ServiceTicket[];
  readonly required: readonly ToppingId[];
  readonly layout: ServiceLayout;
  readonly toppingSequence: readonly ToppingId[];
  brothHold: typeof emptyBrothHold;
  brothHeat: number;
  noodleSweep: number;
  readonly railButtons: readonly Phaser.GameObjects.Container[];
  /** Native-space bounds for the art/layout e2e gate. */
  readonly stageArt: () => {
    readonly stage: TextBox;
    readonly status: TextBox;
    readonly pot: NativeBox;
    readonly basket: NativeBox;
    readonly header: TextBox | null;
    readonly ticketNames: readonly TextBox[];
  };
  select(i: number): void;
  addTopping(t: ToppingId): void;
  addToppingByIndex(i: number): void;
  stopNoodles(): void;
  serve(): void;
  openDoors(): void;
  sampleBroth(): void;
}

/** Publish the same `window.__nyanService` API the e2e specs already use. */
export function exposeServiceDebugApi(host: Phaser.Scene, s: ServiceDebugView): void {
  const api = {
    inSession: () => s.inSession,
    stage: () => s.stage,
    activeIdx: () => s.activeIdx,
    streak: () => s.streak,
    coins: () => s.coins,
    completed: () => [...s.completed],
    qualities: () => [...s.qualities],
    tickets: () =>
      s.tickets.map((t) => ({
        recipeId: t.order.recipeId,
        extras: [...t.order.extraToppings],
        price: t.order.price,
        doneness: t.doneness,
      })),
    required: () => [...s.required],
    layout: () => s.layout,
    stageArt: () => s.stageArt(),
    toppingSequence: () => [...s.toppingSequence],
    broth: () => ({ ...s.brothHold, heat: s.brothHeat }),
    noodleSweep: () => s.noodleSweep,
    select: (i: number) => s.select(i),
    ticketScreen: (i: number) => nativeScreenPoint(host, s.railButtons[i]!.x, s.railButtons[i]!.y),
    addTopping: (t: ToppingId) => s.addTopping(t),
    addToppingByIndex: (i: number) => s.addToppingByIndex(i),
    stopNoodles: () => s.stopNoodles(),
    serve: () => s.serve(),
    openDoors: () => s.openDoors(),
    /** DEBUG: drive the broth needle directly, one sample per call. */
    setBrothHeat: (h: number) => void ((s.brothHeat = Phaser.Math.Clamp(h, 0, 1)), s.sampleBroth()),
    /** DEBUG: set the noodle sweep position directly (before/after stop). */
    setNoodleSweep: (sweep: number) => void (s.noodleSweep = sweep % 1),
  };
  (window as unknown as { __nyanService: typeof api }).__nyanService = api;
}
