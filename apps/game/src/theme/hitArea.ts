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
  // ButtonBox x/y are top-left corners: measure the free space between edges.
  const gap = Math.max(other.y - (box.y + box.height), box.y - (other.y + other.height));
  return Math.max(0, Math.min(desired, Math.floor(gap / 2)));
}

/**
 * Largest symmetric horizontal hit-area expansion that cannot cover a neighbour's
 * visible face. Returns `desired` when the boxes do not overlap vertically.
 */
export function safeHorizontalPad(box: ButtonBox, other: ButtonBox, desired: number): number {
  if (desired <= 0) return 0;
  const overlapsY = box.y < other.y + other.height && other.y < box.y + box.height;
  if (!overlapsY) return desired;
  // ButtonBox x/y are top-left corners: measure the free space between edges.
  const gap = Math.max(other.x - (box.x + box.width), box.x - (other.x + other.width));
  return Math.max(0, Math.min(desired, Math.floor(gap / 2)));
}
