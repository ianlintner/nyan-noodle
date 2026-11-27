import { describe, expect, it } from 'vitest';
import { safeHorizontalPad, safeVerticalPad, type ButtonBox } from './hitArea';

const button = (x: number, y: number, width = 56, height = 14): ButtonBox => ({
  x,
  y,
  width,
  height,
});

describe('safeVerticalPad', () => {
  it('keeps the full pad when buttons are side by side', () => {
    expect(safeVerticalPad(button(124, 252), button(184, 252), 5)).toBe(5);
  });

  it('removes vertical padding for stacked 14px buttons on a 15px stride', () => {
    expect(safeVerticalPad(button(124, 252), button(124, 267), 5)).toBe(0);
    expect(safeVerticalPad(button(124, 267), button(124, 252), 5)).toBe(0);
  });

  it('allows a partial pad when the gap is wider', () => {
    expect(safeVerticalPad(button(124, 252), button(124, 264), 5)).toBe(0);
    expect(safeVerticalPad(button(124, 252), button(124, 272), 5)).toBe(3);
  });

  it('never returns a negative pad for overlapping buttons', () => {
    expect(safeVerticalPad(button(124, 252), button(124, 252), 5)).toBe(0);
  });

  it('uses the edge gap for unequal-height neighbours', () => {
    const tall = { x: 4, y: 10, width: 20, height: 14 };
    expect(safeVerticalPad(tall, { x: 4, y: 25, width: 20, height: 10 }, 5)).toBe(0);
    expect(safeVerticalPad(tall, { x: 4, y: 30, width: 20, height: 10 }, 5)).toBe(3);
  });
});

describe('safeHorizontalPad', () => {
  it('keeps the full pad for buttons on different rows', () => {
    expect(safeHorizontalPad(button(124, 252), button(184, 266), 5)).toBe(5);
  });

  it('clamps the pad for the 6px settings -/+ gap', () => {
    expect(safeHorizontalPad(button(62, 100, 24), button(92, 100, 24), 5)).toBe(3);
    expect(safeHorizontalPad(button(92, 100, 24), button(62, 100, 24), 5)).toBe(3);
  });

  it('uses the edge gap for unequal-width neighbours (shop toggle/speed)', () => {
    expect(safeHorizontalPad(button(4, 252, 64), button(72, 252, 48), 5)).toBe(2);
    expect(safeHorizontalPad(button(72, 252, 48), button(4, 252, 64), 5)).toBe(2);
  });

  it('allows a partial pad for a wider gap and never goes negative', () => {
    expect(safeHorizontalPad(button(124, 252, 56), button(186, 252, 56), 5)).toBe(3);
    expect(safeHorizontalPad(button(124, 252, 56), button(124, 252, 56), 5)).toBe(0);
  });
});
