import { describe, expect, it } from 'vitest';
import { safeVerticalPad, type ButtonBox } from './hitArea';

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
});
