import type Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Largest integer zoom at which the whole map fits the native viewport. */
export function fitZoom(mapWidth: number, mapHeight: number): number {
  const fit = Math.min(Math.floor(NATIVE_WIDTH / mapWidth), Math.floor(NATIVE_HEIGHT / mapHeight));
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

/** Clamp a camera center so the map (or its centre, if smaller than the view) stays on screen. */
export function clampCenter(center: number, mapSize: number, viewSize: number, margin = 8): number {
  if (mapSize + margin * 2 <= viewSize) return mapSize / 2;
  const lo = viewSize / 2 - margin;
  const hi = mapSize - viewSize / 2 + margin;
  return Math.min(hi, Math.max(lo, center));
}

/** Integer-zoom pan/zoom controls for the main (world) camera. */
export class CameraRig {
  private cx: number;
  private cy: number;
  private dragging = false;
  private last = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private mapWidth: number,
    private mapHeight: number,
  ) {
    this.cx = mapWidth / 2;
    this.cy = mapHeight / 2;
    this.setZoom(fitZoom(mapWidth, mapHeight));
    this.bindInput();
  }

  /** Mouse-drag panning; build mode turns it off so clicks place furniture instead. */
  dragEnabled = true;

  /** The map grew (shop tier upgrade): recentre and refit the zoom. */
  resize(mapWidth: number, mapHeight: number): void {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.cx = mapWidth / 2;
    this.cy = mapHeight / 2;
    this.setZoom(fitZoom(mapWidth, mapHeight));
  }

  get zoom(): number {
    return this.scene.cameras.main.zoom;
  }

  setZoom(zoom: number): void {
    const z = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)));
    this.scene.cameras.main.setZoom(z);
    this.apply();
  }

  pan(dx: number, dy: number): void {
    this.cx += dx;
    this.cy += dy;
    this.apply();
  }

  private apply(): void {
    const cam = this.scene.cameras.main;
    const viewW = NATIVE_WIDTH / cam.zoom;
    const viewH = NATIVE_HEIGHT / cam.zoom;
    this.cx = clampCenter(this.cx, this.mapWidth, viewW);
    this.cy = clampCenter(this.cy, this.mapHeight, viewH);
    cam.centerOn(Math.round(this.cx), Math.round(this.cy));
  }

  private bindInput(): void {
    const kb = this.scene.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      const step = 16;
      switch (e.key) {
        case '+':
        case '=':
          this.setZoom(this.zoom + 1);
          break;
        case '-':
        case '_':
          this.setZoom(this.zoom - 1);
          break;
        case 'ArrowLeft':
        case 'a':
          this.pan(-step, 0);
          break;
        case 'ArrowRight':
        case 'd':
          this.pan(step, 0);
          break;
        case 'ArrowUp':
        case 'w':
          this.pan(0, -step);
          break;
        case 'ArrowDown':
        case 's':
          this.pan(0, step);
          break;
      }
    });
    this.scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.setZoom(this.zoom + (dy < 0 ? 1 : -1));
    });
    this.scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = this.dragEnabled;
      this.last = { x: p.x, y: p.y };
    });
    this.scene.input.on('pointerup', () => {
      this.dragging = false;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.pan(-(p.x - this.last.x) / this.zoom, -(p.y - this.last.y) / this.zoom);
      this.last = { x: p.x, y: p.y };
    });
  }
}
