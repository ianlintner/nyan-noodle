import type { Cell } from './layout';

/**
 * 4-connected A* over a blocked-cell grid. The start and goal cells are always
 * enterable (a cat may stand on its stool). Returns the cells from start to
 * goal inclusive, or null when unreachable. Deterministic tie-breaking.
 */
export function findPath(
  blocked: readonly (readonly boolean[])[],
  start: Cell,
  goal: Cell,
): Cell[] | null {
  const rows = blocked.length;
  const cols = blocked[0]?.length ?? 0;
  const inside = (c: Cell): boolean => c.tx >= 0 && c.ty >= 0 && c.tx < cols && c.ty < rows;
  if (!inside(start) || !inside(goal)) return null;
  const key = (c: Cell): number => c.ty * cols + c.tx;
  const h = (c: Cell): number => Math.abs(c.tx - goal.tx) + Math.abs(c.ty - goal.ty);

  const g = new Map<number, number>([[key(start), 0]]);
  const parent = new Map<number, number>();
  const open: { cell: Cell; f: number; order: number }[] = [{ cell: start, f: h(start), order: 0 }];
  const closed = new Set<number>();
  let order = 1;

  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i]!;
      const b = open[best]!;
      if (a.f < b.f || (a.f === b.f && a.order < b.order)) best = i;
    }
    const { cell } = open.splice(best, 1)[0]!;
    const ck = key(cell);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cell.tx === goal.tx && cell.ty === goal.ty) {
      const path: Cell[] = [cell];
      let k = ck;
      while (parent.has(k)) {
        k = parent.get(k)!;
        path.push({ tx: k % cols, ty: Math.floor(k / cols) });
      }
      return path.reverse();
    }
    const base = g.get(ck)!;
    const neighbors: Cell[] = [
      { tx: cell.tx, ty: cell.ty - 1 },
      { tx: cell.tx + 1, ty: cell.ty },
      { tx: cell.tx, ty: cell.ty + 1 },
      { tx: cell.tx - 1, ty: cell.ty },
    ];
    for (const n of neighbors) {
      if (!inside(n)) continue;
      const isGoal = n.tx === goal.tx && n.ty === goal.ty;
      if (blocked[n.ty]![n.tx] && !isGoal) continue;
      const nk = key(n);
      const cost = base + 1;
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        parent.set(nk, ck);
        open.push({ cell: n, f: cost + h(n), order: order++ });
      }
    }
  }
  return null;
}
