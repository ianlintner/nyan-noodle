// @vitest-environment node
// Enforces the module rules in ARCHITECTURE.md: the ~400 LOC file ceiling and a
// Phaser/DOM-free sim package.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_LINES = 400;
const SOURCE = /\.(ts|mjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name)) out.push(path);
  }
  return out;
}

const files = ['apps', 'packages', 'scripts', 'e2e'].flatMap((d) => walk(join(ROOT, d)));

describe('architecture rules', () => {
  it(`keeps every source file at or under ${MAX_LINES} lines`, () => {
    const over = files
      .map((f) => [relative(ROOT, f), readFileSync(f, 'utf8').split('\n').length - 1])
      .filter(([, n]) => n > MAX_LINES);
    expect(over).toEqual([]);
  });

  it('keeps packages/sim free of Phaser, DOM and app imports', () => {
    const banned = /from '(phaser|@nyan-noodle\/game)|\b(window|document|localStorage)\.[a-zA-Z]/;
    // Strip comments so prose like "the boil window." is not flagged.
    const code = (f) =>
      readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    const leaks = files
      .filter((f) => relative(ROOT, f).startsWith('packages/sim/src/'))
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => banned.test(code(f)))
      .map((f) => relative(ROOT, f));
    expect(leaks).toEqual([]);
  });
});
