export interface ButtonBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Largest symmetric vertical hit-area expansion that cannot cover a neighbour's
 * visible face. Returns `desired` when the boxes do not overlap horizontally.
 */
export function safeVerticalPad(box: ButtonBox, other: ButtonBox, desired: number): number {
  if (desired <= 0) return 0;
  const overlapsX = box.x < other.x + other.width && other.x < box.x + box.width;
  if (!overlapsX) return desired;
  const gap = Math.abs(box.y - other.y);
  const halfSum = (box.height + other.height) / 2;
  return Math.max(0, Math.min(desired, Math.floor((gap - halfSum) / 2)));
}
